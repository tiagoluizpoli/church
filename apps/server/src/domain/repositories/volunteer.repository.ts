import type { ChurchId } from '../entities/church';
import type { MinistryId } from '../entities/ministry';
import type { RoleId } from '../entities/role';
import type {
  UserId,
  Volunteer,
  VolunteerId,
  VolunteerStatus,
} from '../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface VolunteerLeadership {
  ministryId: MinistryId;
  ministryName: string;
}

export interface VolunteerRepository {
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
}
