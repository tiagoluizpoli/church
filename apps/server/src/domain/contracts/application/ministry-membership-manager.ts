import type { Instant } from '@church/time';
import type { MinistryMembershipOperation } from '../../authority/types';
import type { ChurchId, RoleId, UserId } from '../../branded-ids';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { PersonDetailRole } from '../../entities/people-list-item';
import type { IAuthorityManager } from './authority-manager';
import type { ChurchAccessRepository } from '@/domain/contracts/infrastructure/church-access.repository';
import type {
  MembershipTarget,
  MinistryMembershipRepository,
  UpcomingAssignmentScope,
} from '@/domain/contracts/infrastructure/ministry-membership.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface SetMinistryRolesRequest {
  /** Both from the authenticated Active Church context, never the payload. */
  churchId: ChurchId;
  actorId: UserId;
  /** Church Membership id. */
  memberId: string;
  /** Ministry Membership id. */
  membershipId: string;
  /** The complete set; omitted Roles are removals. */
  roleIds: RoleId[];
}

export interface EndMinistryMembershipRequest {
  /** Both from the authenticated Active Church context, never the payload. */
  churchId: ChurchId;
  actorId: UserId;
  /** Church Membership id. */
  memberId: string;
  /** Ministry Membership id. */
  membershipId: string;
}

export interface MinistryMembershipEnded {
  memberId: string;
  membershipId: string;
  status: 'inactive';
  leftAt: Instant;
  changed: true;
}

export type EndMinistryMembershipOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | ({ kind: 'applied' } & MinistryMembershipEnded);

export interface ChangeMinistryAccessRequest
  extends Omit<SetMinistryRolesRequest, 'roleIds'> {
  accessLevel: MinistryAccessLevel;
  /** The complete replacement set; omitted keeps the held Roles. */
  roleIds?: RoleId[];
}

export interface MinistryMembershipChange {
  memberId: string;
  membershipId: string;
  ministryAccessLevel: MinistryAccessLevel;
  roles: PersonDetailRole[];
  changed: boolean;
}

/** `forbidden` is a refusal inside the caller's visible scope; `not-found` hides the target. */
export type MinistryMembershipOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | ({ kind: 'applied' } & MinistryMembershipChange);

/**
 * The one boundary for Ministry Membership changes: Church lock, locked
 * target, fresh authority, rules, Assignment guard, write and audit in one
 * transaction. Typed refusals throw `InvalidMinistryRoleError`,
 * `MinistryRoleRequiredError`, `MinistryMembershipInactiveError` or
 * `UpcomingAssignmentsError`.
 */
export interface IMinistryMembershipManager {
  setMinistryRoles(
    input: SetMinistryRolesRequest,
  ): Promise<MinistryMembershipOutcome>;
  /** Ends the membership, withdrawing its actionable Availability Checks; refused while an upcoming Assignment needs it. */
  endMinistryMembership(
    input: EndMinistryMembershipRequest,
  ): Promise<EndMinistryMembershipOutcome>;
  /** Level, and optionally the complete Role set, in one transaction and one audit. */
  changeMinistryAccess(
    input: ChangeMinistryAccessRequest,
  ): Promise<MinistryMembershipOutcome>;
}

export interface DbMinistryMembershipManagerDependencies {
  authorityManager: IAuthorityManager;
  churchAccessRepository: ChurchAccessRepository;
  membershipRepository: MinistryMembershipRepository;
  roleRepository: RoleRepository;
  unitOfWork: UnitOfWork;
}

export interface LockAndAuthorizeInput {
  churchId: ChurchId;
  actorId: UserId;
  memberId: string;
  membershipId: string;
  operation: MinistryMembershipOperation;
  tx: TransactionContext;
}

export type LockAndAuthorizeResult =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'authorized'; target: MembershipTarget };

export interface GuardUpcomingAssignmentsInput {
  churchId: ChurchId;
  target: MembershipTarget;
  /** Removed Roles, or the whole membership when it ends. */
  scope: UpcomingAssignmentScope;
  /** The operation's one Instant, also its write and audit time. */
  at: Instant;
  tx: TransactionContext;
}

export interface LockGrantableRolesInput {
  churchId: ChurchId;
  target: MembershipTarget;
  addedRoleIds: RoleId[];
  tx: TransactionContext;
}

export interface RoleDifferenceInput {
  held: RoleId[];
  requested: ReadonlySet<RoleId>;
}
