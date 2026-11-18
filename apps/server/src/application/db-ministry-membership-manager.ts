import { type Instant, now, toDate } from '@church/time';
import type { MinistryMembershipOperation } from '../domain/authority/types';
import { type ChurchId, RoleId, type UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  ChangeMinistryAccessRequest,
  EndMinistryMembershipOutcome,
  EndMinistryMembershipRequest,
  IMinistryMembershipManager,
  MinistryMembershipOutcome,
  SetMinistryRolesRequest,
} from '../domain/contracts/application/ministry-membership-manager';
import type { ChurchAccessRepository } from '../domain/contracts/infrastructure/church-access.repository';
import type {
  MembershipTarget,
  MinistryMembershipRepository,
  UpcomingAssignmentScope,
} from '../domain/contracts/infrastructure/ministry-membership.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { InvalidMinistryRoleError } from '../domain/errors/invalid-ministry-role';
import { MinistryMembershipInactiveError } from '../domain/errors/ministry-membership-inactive';
import { MinistryRoleRequiredError } from '../domain/errors/ministry-role-required';
import { UpcomingAssignmentsError } from '../domain/errors/upcoming-assignments';

interface DbMinistryMembershipManagerDependencies {
  authorityManager: IAuthorityManager;
  churchAccessRepository: ChurchAccessRepository;
  membershipRepository: MinistryMembershipRepository;
  roleRepository: RoleRepository;
  unitOfWork: UnitOfWork;
}

interface LockAndAuthorizeInput {
  churchId: ChurchId;
  actorId: UserId;
  memberId: string;
  membershipId: string;
  operation: MinistryMembershipOperation;
  tx: TransactionContext;
}

type LockAndAuthorizeResult =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'authorized'; target: MembershipTarget };

interface GuardUpcomingAssignmentsInput {
  churchId: ChurchId;
  target: MembershipTarget;
  /** Removed Roles, or the whole membership when it ends. */
  scope: UpcomingAssignmentScope;
  /** The operation's one Instant, also its write and audit time. */
  at: Instant;
  tx: TransactionContext;
}

interface LockGrantableRolesInput {
  churchId: ChurchId;
  target: MembershipTarget;
  addedRoleIds: RoleId[];
  tx: TransactionContext;
}

interface RoleDifferenceInput {
  held: RoleId[];
  requested: ReadonlySet<RoleId>;
}

/** Compares sets: order and duplicate ids never make a change. */
function roleDifference({ held, requested }: RoleDifferenceInput) {
  const heldSet = new Set(held);
  return {
    addedRoleIds: [...requested].filter((id) => !heldSet.has(id)),
    removedRoleIds: held.filter((id) => !requested.has(id)),
  };
}

/**
 * Every Ministry Membership change of one Church runs behind the Church lock
 * that Church access changes take, then locks its target chain in the
 * Volunteer Transfer order, so the actor's authority, the target facts and
 * the Assignment guard are all read fresh after any wait.
 *
 * Lock order: Church (NO KEY UPDATE) → Volunteer profile → Ministry
 * Membership (both NO KEY UPDATE) → newly granted Roles (SHARE).
 */
export class DbMinistryMembershipManager implements IMinistryMembershipManager {
  private readonly authorityManager: IAuthorityManager;
  private readonly churchAccessRepository: ChurchAccessRepository;
  private readonly membershipRepository: MinistryMembershipRepository;
  private readonly roleRepository: RoleRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    authorityManager,
    churchAccessRepository,
    membershipRepository,
    roleRepository,
    unitOfWork,
  }: DbMinistryMembershipManagerDependencies) {
    this.authorityManager = authorityManager;
    this.churchAccessRepository = churchAccessRepository;
    this.membershipRepository = membershipRepository;
    this.roleRepository = roleRepository;
    this.unitOfWork = unitOfWork;
  }

  setMinistryRoles({
    churchId,
    actorId,
    memberId,
    membershipId,
    roleIds,
  }: SetMinistryRolesRequest): Promise<MinistryMembershipOutcome> {
    return this.unitOfWork.run(async (tx) => {
      const locked = await this.lockAndAuthorize({
        churchId,
        actorId,
        memberId,
        membershipId,
        operation: 'editRoles',
        tx,
      });
      if (locked.kind !== 'authorized') return locked;
      const { target } = locked;

      const requested = new Set(roleIds);
      const { addedRoleIds, removedRoleIds } = roleDifference({
        held: target.roleIds,
        requested,
      });
      const applied = {
        kind: 'applied',
        memberId,
        membershipId,
        ministryAccessLevel: target.ministryAccessLevel,
      } as const;
      if (addedRoleIds.length === 0 && removedRoleIds.length === 0) {
        const roles = await this.membershipRepository.listRoles({
          churchId,
          membershipId,
          tx,
        });
        return { ...applied, roles, changed: false };
      }

      await this.lockGrantableRoles({ churchId, target, addedRoleIds, tx });
      if (target.ministryAccessLevel === 'volunteer' && requested.size === 0) {
        throw new MinistryRoleRequiredError();
      }
      const changedAt = now();
      await this.guardUpcomingAssignments({
        churchId,
        target,
        scope: { kind: 'roles', roleIds: removedRoleIds },
        at: changedAt,
        tx,
      });

      const correlationId = crypto.randomUUID();
      const changedAtDate = toDate({ instant: changedAt });
      await this.membershipRepository.saveRoles({
        churchId,
        actorId,
        target,
        addedRoleIds,
        removedRoleIds,
        correlationId,
        changedAt: changedAtDate,
        tx,
      });
      const roles = await this.membershipRepository.listRoles({
        churchId,
        membershipId,
        tx,
      });
      return { ...applied, roles, changed: true };
    });
  }

  async changeMinistryAccess({
    churchId,
    actorId,
    memberId,
    membershipId,
    accessLevel,
    roleIds,
  }: ChangeMinistryAccessRequest): Promise<MinistryMembershipOutcome> {
    return this.unitOfWork.run(async (tx) => {
      const locked = await this.lockAndAuthorize({
        churchId,
        actorId,
        memberId,
        membershipId,
        operation: 'changeLevel',
        tx,
      });
      if (locked.kind !== 'authorized') return locked;
      const { target } = locked;

      const held = await this.membershipRepository.listRoles({
        churchId,
        membershipId,
        tx,
      });
      // Omitted roleIds keep every held Role, archived ones included.
      const requested = new Set(roleIds ?? target.roleIds);
      const { addedRoleIds, removedRoleIds } = roleDifference({
        held: target.roleIds,
        requested,
      });
      const rolesChanged = addedRoleIds.length + removedRoleIds.length > 0;
      if (accessLevel === target.ministryAccessLevel && !rolesChanged) {
        return {
          kind: 'applied',
          memberId,
          membershipId,
          ministryAccessLevel: accessLevel,
          roles: held,
          changed: false,
        };
      }

      await this.lockGrantableRoles({ churchId, target, addedRoleIds, tx });
      // A demotion needs an active Role to land on; an unchanged volunteer keeps the plain "any Role" rule.
      const demoting =
        accessLevel === 'volunteer' && target.ministryAccessLevel === 'leader';
      const resulting = demoting
        ? addedRoleIds.length +
          held.filter((r) => !r.archived && requested.has(RoleId.from(r.id)))
            .length
        : requested.size;
      if (accessLevel === 'volunteer' && resulting === 0) {
        throw new MinistryRoleRequiredError();
      }
      const changedAt = now();
      await this.guardUpcomingAssignments({
        churchId,
        target,
        scope: { kind: 'roles', roleIds: removedRoleIds },
        at: changedAt,
        tx,
      });

      const correlationId = crypto.randomUUID();
      const changedAtDate = toDate({ instant: changedAt });
      await this.membershipRepository.saveAccess({
        churchId,
        actorId,
        target,
        accessLevel,
        rolesChanged,
        addedRoleIds,
        removedRoleIds,
        correlationId,
        changedAt: changedAtDate,
        tx,
      });
      const roles = await this.membershipRepository.listRoles({
        churchId,
        membershipId,
        tx,
      });
      return {
        kind: 'applied',
        memberId,
        membershipId,
        ministryAccessLevel: accessLevel,
        roles,
        changed: true,
      };
    });
  }

  endMinistryMembership({
    churchId,
    actorId,
    memberId,
    membershipId,
  }: EndMinistryMembershipRequest): Promise<EndMinistryMembershipOutcome> {
    return this.unitOfWork.run(async (tx) => {
      const locked = await this.lockAndAuthorize({
        churchId,
        actorId,
        memberId,
        membershipId,
        operation: 'endMembership',
        tx,
      });
      if (locked.kind !== 'authorized') return locked;
      const { target } = locked;
      const leftAt = now();
      await this.guardUpcomingAssignments({
        churchId,
        target,
        scope: { kind: 'membership' },
        at: leftAt,
        tx,
      });

      const correlationId = crypto.randomUUID();
      const leftAtDate = toDate({ instant: leftAt });
      await this.membershipRepository.endMembership({
        churchId,
        actorId,
        target,
        correlationId,
        changedAt: leftAtDate,
        tx,
      });
      return {
        kind: 'applied',
        memberId,
        membershipId,
        status: 'inactive',
        leftAt,
        changed: true,
      };
    });
  }

  /** Only active Roles of the target's Ministry are grantable; the share lock waits out a concurrent archive. */
  private async lockGrantableRoles({
    churchId,
    target,
    addedRoleIds,
    tx,
  }: LockGrantableRolesInput): Promise<void> {
    const grantable = await this.roleRepository.lockActiveForUse({
      churchId,
      ministryId: target.ministryId,
      roleIds: addedRoleIds,
      tx,
    });
    if (grantable.length !== addedRoleIds.length) {
      throw new InvalidMinistryRoleError();
    }
  }

  /**
   * Church lock, locked target chain, then the actor's authority read fresh
   * in the same transaction. An ended target is refused as inactive to an
   * admin and hidden from everyone else.
   */
  private async lockAndAuthorize({
    churchId,
    actorId,
    memberId,
    membershipId,
    operation,
    tx,
  }: LockAndAuthorizeInput): Promise<LockAndAuthorizeResult> {
    await this.churchAccessRepository.lockChurch({ churchId, tx });
    const target = await this.membershipRepository.lockTarget({
      churchId,
      memberId,
      membershipId,
      tx,
    });
    if (!target) return { kind: 'not-found' };
    if (target.status !== 'active') {
      // Only an admin learns that the membership ended; to anyone else it is gone.
      const isAdmin = await this.authorityManager.canManageChurch({
        churchId,
        userId: actorId,
        tx,
      });
      if (!isAdmin) return { kind: 'not-found' };
      throw new MinistryMembershipInactiveError();
    }
    const decision = await this.authorityManager.decideManageMinistryMembership(
      {
        churchId,
        userId: actorId,
        target: {
          ministryId: target.ministryId,
          subjectUserId: target.subjectUserId,
          ministryAccessLevel: target.ministryAccessLevel,
          operation,
        },
        tx,
      },
    );
    if (decision.allowed) return { kind: 'authorized', target };
    // A refused target inside the actor's visible scope is 403; anything else hides it.
    return decision.reason === 'INSUFFICIENT_ACCESS_LEVEL'
      ? { kind: 'forbidden' }
      : { kind: 'not-found' };
  }

  /** The shared guard: no removed Role, or ended membership, may still be needed by an upcoming Assignment. */
  private async guardUpcomingAssignments({
    churchId,
    target,
    scope,
    at,
    tx,
  }: GuardUpcomingAssignmentsInput): Promise<void> {
    const assignments =
      await this.membershipRepository.listUpcomingMembershipAssignments({
        churchId,
        volunteerId: target.volunteerId,
        ministryId: target.ministryId,
        scope,
        at,
        tx,
      });
    if (assignments.length > 0) {
      throw new UpcomingAssignmentsError({ assignments });
    }
  }
}
