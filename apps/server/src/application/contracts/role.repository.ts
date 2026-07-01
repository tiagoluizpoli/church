import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { Role, RoleId } from '../../domain/entities/role';
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

  /** List all role IDs that are global or belong to any of the given ministries. */
  listGlobalAndMinistryRoleIds(
    churchId: ChurchId,
    ministryIds: MinistryId[],
    tx?: TransactionContext,
  ): Promise<RoleId[]>;
}
