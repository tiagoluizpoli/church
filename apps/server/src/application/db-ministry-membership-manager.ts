import { now, toDate } from '@church/time';
import type { MinistryMembershipOperation } from '../domain/authority/types';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
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
  /** The removed Roles; omitted guards every Role, as ending the membership does. */
  removedRoleIds?: string[];
  tx: TransactionContext;
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

      // Compare sets: order and duplicate ids never make a change.
      const requested = new Set(roleIds);
      const held = new Set(target.roleIds);
      const addedRoleIds = [...requested].filter((id) => !held.has(id));
      const removedRoleIds = target.roleIds.filter((id) => !requested.has(id));
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

      // Only active Roles of this Ministry are grantable; the share lock waits out a concurrent archive.
      const grantable = await this.roleRepository.lockActiveForUse({
        churchId,
        ministryId: target.ministryId,
        roleIds: addedRoleIds,
        tx,
      });
      if (grantable.length !== addedRoleIds.length) {
        throw new InvalidMinistryRoleError();
      }
      if (target.ministryAccessLevel === 'volunteer' && requested.size === 0) {
        throw new MinistryRoleRequiredError();
      }
      await this.guardUpcomingAssignments({
        churchId,
        target,
        removedRoleIds,
        tx,
      });

      const changedAt = now();
      await this.membershipRepository.saveRoles({
        churchId,
        actorId,
        target,
        addedRoleIds,
        removedRoleIds,
        correlationId: crypto.randomUUID(),
        changedAt: toDate({ instant: changedAt }),
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
      await this.guardUpcomingAssignments({ churchId, target, tx });

      const leftAt = now();
      await this.membershipRepository.endMembership({
        churchId,
        actorId,
        target,
        correlationId: crypto.randomUUID(),
        changedAt: toDate({ instant: leftAt }),
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

  /**
   * Church lock, locked target chain, then the actor's authority read fresh
   * in the same transaction. An ended target the actor could otherwise
   * manage is refused as inactive; one outside their scope stays hidden.
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
    if (decision.allowed) {
      if (target.status !== 'active')
        throw new MinistryMembershipInactiveError();
      return { kind: 'authorized', target };
    }
    // A refused target inside the actor's visible scope is 403; anything else hides it.
    return decision.reason === 'INSUFFICIENT_ACCESS_LEVEL'
      ? { kind: 'forbidden' }
      : { kind: 'not-found' };
  }

  /** The shared guard: no removed Role, or ended membership, may still be needed by an upcoming Assignment. */
  private async guardUpcomingAssignments({
    churchId,
    target,
    removedRoleIds,
    tx,
  }: GuardUpcomingAssignmentsInput): Promise<void> {
    if (removedRoleIds?.length === 0) return;
    const assignments =
      await this.membershipRepository.listUpcomingMembershipAssignments({
        churchId,
        volunteerId: target.volunteerId,
        ministryId: target.ministryId,
        roleIds: removedRoleIds,
        at: now(),
        tx,
      });
    if (assignments.length > 0) {
      throw new UpcomingAssignmentsError({ assignments });
    }
  }
}
