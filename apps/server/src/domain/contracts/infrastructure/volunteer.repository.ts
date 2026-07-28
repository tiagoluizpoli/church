import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { MinistryAccessLevel } from '../../entities/ministry-volunteer';
import type { Volunteer, VolunteerStatus } from '../../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface VolunteerLeadership {
  ministryId: MinistryId;
  ministryName: string;
}

/** Mirrors `ministry_volunteer_team.access_level` — TeamLeader is `'leader'` here, scoped to that one team. */
export type TeamAccessLevel = 'leader' | 'member';

export interface MinistryTeamMembership {
  teamId: string;
  accessLevel: TeamAccessLevel;
}

/**
 * A volunteer's membership within a single ministry.
 *
 * Teams and qualified roles are independent axes: a member may belong to
 * several teams and be qualified for several roles, and eligibility for a slot
 * composes the two ("qualified for the role AND — when the requirement names a
 * team — a member of that team"). `ministryAccessLevel` is ministry-wide;
 * TeamLeader-ness is per-team, carried in `teamMemberships`.
 */
export interface MinistryMembership {
  volunteerId: VolunteerId;
  /** Every team this member belongs to within the ministry, with their access level in each. */
  teamMemberships: MinistryTeamMembership[];
  /** Roles this member is qualified to fill, including global roles. */
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

export interface VolunteerRepository {
  isChurchAdmin(
    churchId: ChurchId,
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<boolean>;

  getById(
    churchId: ChurchId,
    id: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Volunteer>;

  findByUserId(
    churchId: ChurchId,
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<Volunteer | null>;

  listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<Volunteer[]>;

  hasMembershipInMinistry(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<boolean>;

  hasRoleQualification(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<boolean>;

  listQualifiedForRole(
    churchId: ChurchId,
    ministryId: MinistryId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<Volunteer[]>;

  updateStatus(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    status: VolunteerStatus,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Find a volunteer by their auth userId without knowing the churchId. */
  findByUserIdGlobally(
    userId: UserId,
    tx?: TransactionContext,
  ): Promise<Volunteer | null>;

  /** Check if a volunteer holds a leadership role in the given ministry. */
  hasLeadershipInMinistry(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<boolean>;

  /** List every ministry in which the volunteer is a leader. */
  listLedMinistries(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<VolunteerLeadership[]>;

  /** Bulk-fetch volunteers by a list of ids (all within the same church). */
  listByIds(
    churchId: ChurchId,
    ids: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Volunteer[]>;

  /** List all ministry IDs where the volunteer is an active member. */
  listMemberMinistryIds(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<MinistryId[]>;

  /**
   * List active memberships (team memberships, qualified roles, ministry
   * access level) for a ministry. Used for TeamLeader scoping and candidate
   * eligibility in the builder.
   */
  listMinistryMemberships(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<MinistryMembership[]>;
}
