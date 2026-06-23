import type { ChurchId } from '../entities/church';
import type { MinistryId } from '../entities/ministry';
import type { Role, RoleId } from '../entities/role';
import type { TransactionContext } from './transaction-context';

export interface RoleRepository {
  getById(
    churchId: ChurchId,
    id: RoleId,
    tx?: TransactionContext,
  ): Promise<Role>;

  listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<Role[]>;
}
