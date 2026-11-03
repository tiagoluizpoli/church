import type { Instant } from '@church/time';
import type {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { PersonDetailRole } from '../../entities/people-list-item';
import type { UpcomingMembershipAssignment } from '../../upcoming-membership-assignments';
import type { TransactionContext } from './transaction-context';

export interface LockMembershipTargetInput {
  churchId: ChurchId;
  /** Church Membership id. */
  memberId: string;
  /** Ministry Membership id. */
  membershipId: string;
  tx: TransactionContext;
}

/** The locked chain Church Member → active Volunteer profile → active Ministry Membership. */
export interface MembershipTarget {
  memberId: string;
  membershipId: string;
  subjectUserId: UserId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  ministryAccessLevel: MinistryAccessLevel;
  /** Every Role held, archived ones included. */
  roleIds: string[];
}

export interface ListUpcomingMembershipAssignmentsInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  /** Only Assignments for these Roles; omitted means every Role of the Membership. */
  roleIds?: string[];
  at: Instant;
  tx: TransactionContext;
}

export interface SaveMembershipRolesInput {
  churchId: ChurchId;
  actorId: UserId;
  target: MembershipTarget;
  addedRoleIds: string[];
  removedRoleIds: string[];
  correlationId: string;
  changedAt: Date;
  tx: TransactionContext;
}

export interface ListMembershipRolesInput {
  churchId: ChurchId;
  membershipId: string;
  tx: TransactionContext;
}

/**
 * Ministry Membership writes for People. Every method runs in the caller's
 * transaction after the Church lock (`ChurchAccessRepository.lockChurch`).
 */
export interface MinistryMembershipRepository {
  /**
   * Resolves and locks the target chain, profile then membership (the
   * Volunteer Transfer order), or undefined when any link is missing,
   * mismatched, retired, ended, in an archived Ministry or another Church.
   */
  lockTarget(
    input: LockMembershipTargetInput,
  ): Promise<MembershipTarget | undefined>;
  /**
   * Active (`draft`/`pending`/`confirmed`) Assignments of the Volunteer in the
   * Ministry on non-cancelled Events whose end is after `at`, unique and
   * ordered by Shift start then Assignment id.
   */
  listUpcomingMembershipAssignments(
    input: ListUpcomingMembershipAssignmentsInput,
  ): Promise<UpcomingMembershipAssignment[]>;
  /** Applies the Role difference and writes its one `ministry_roles_changed` audit. */
  saveRoles(input: SaveMembershipRolesInput): Promise<void>;
  /** The held Roles in the detail card shape, by name. */
  listRoles(input: ListMembershipRolesInput): Promise<PersonDetailRole[]>;
}
