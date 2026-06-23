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
}
