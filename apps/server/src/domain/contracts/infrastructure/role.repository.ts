import type { ChurchId, MinistryId, RoleId } from '../../branded-ids';
import type { Role } from '../../entities/role';
import type { TransactionContext } from './transaction-context';

export interface RoleRepository {
  getById(input: GetRoleByIdInput): Promise<Role>;

  listByMinistry(input: ListRolesByMinistryInput): Promise<Role[]>;
}

export interface GetRoleByIdInput {
  churchId: ChurchId;
  id: RoleId;
  tx?: TransactionContext;
}

export interface ListRolesByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}
