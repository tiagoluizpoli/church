import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { Volunteer, VolunteerStatus } from '../../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface VolunteerLeadership {
  ministryId: MinistryId;
  ministryName: string;
}

/**
 * A volunteer's membership within a single ministry.
 *
 * A member may be qualified for several roles. `ministryAccessLevel` is
 * ministry-wide.
 */
export interface MinistryMembership {
  volunteerId: VolunteerId;
  /** Roles this member is qualified to fill, including global roles. */
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

export interface VolunteerRepository {
  getById(input: GetVolunteerByIdInput): Promise<Volunteer>;

  findByUserId(input: FindVolunteerByUserIdInput): Promise<Volunteer | null>;

  listByMinistry(input: ListVolunteersByMinistryInput): Promise<Volunteer[]>;

  hasMembershipInMinistry(
    input: HasMembershipInMinistryInput,
  ): Promise<boolean>;

  hasRoleQualification(input: HasRoleQualificationInput): Promise<boolean>;

  listQualifiedForRole(
    input: ListQualifiedVolunteersForRoleInput,
  ): Promise<Volunteer[]>;

  updateStatus(input: UpdateVolunteerStatusInput): Promise<void>;

  /** Find a volunteer by their auth userId without knowing the churchId. */
  findByUserIdGlobally(
    input: FindVolunteerByUserIdGloballyInput,
  ): Promise<Volunteer | null>;

  /** Check if a volunteer holds a leadership role in the given ministry. */
  hasLeadershipInMinistry(
    input: HasLeadershipInMinistryInput,
  ): Promise<boolean>;

  /** List every ministry in which the volunteer is a leader. */
  listLedMinistries(
    input: ListLedMinistriesInput,
  ): Promise<VolunteerLeadership[]>;

  /** Bulk-fetch volunteers by a list of ids (all within the same church). */
  listByIds(input: ListVolunteersByIdsInput): Promise<Volunteer[]>;

  /** List all ministry IDs where the volunteer is an active member. */
  listMemberMinistryIds(
    input: ListMemberMinistryIdsInput,
  ): Promise<MinistryId[]>;

  /**
   * List active memberships (qualified roles, ministry access level) for
   * a ministry. Used for candidate eligibility in the builder.
   */
  listMinistryMemberships(
    input: ListMinistryMembershipsInput,
  ): Promise<MinistryMembership[]>;

  /**
   * Email addresses of every currently-active leader (`ministryAccessLevel
   * = 'leader'`, `status = 'active'`) of a Ministry — the Volunteer Transfer
   * digest's addressee list (spec §8.8, issue #60). Empty when the Ministry
   * has no active leader.
   */
  listActiveLeaderEmails(input: ListActiveLeaderEmailsInput): Promise<string[]>;
}

export interface ListActiveLeaderEmailsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface GetVolunteerByIdInput {
  churchId: ChurchId;
  id: VolunteerId;
  tx?: TransactionContext;
}

export interface FindVolunteerByUserIdInput {
  churchId: ChurchId;
  userId: UserId;
  tx?: TransactionContext;
}

export interface ListVolunteersByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface HasMembershipInMinistryInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface HasRoleQualificationInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  roleId: RoleId;
  tx?: TransactionContext;
}

export interface ListQualifiedVolunteersForRoleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleId: RoleId;
  tx?: TransactionContext;
}

export interface UpdateVolunteerStatusInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  status: VolunteerStatus;
  tx?: TransactionContext;
}

export interface FindVolunteerByUserIdGloballyInput {
  userId: UserId;
  tx?: TransactionContext;
}

export interface HasLeadershipInMinistryInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface ListLedMinistriesInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface ListVolunteersByIdsInput {
  churchId: ChurchId;
  ids: VolunteerId[];
  tx?: TransactionContext;
}

export interface ListMemberMinistryIdsInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface ListMinistryMembershipsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}
