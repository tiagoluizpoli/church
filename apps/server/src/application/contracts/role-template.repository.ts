import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type {
  RoleTemplate,
  RoleTemplateId,
} from '../../domain/entities/role-template';
import type { TransactionContext } from './transaction-context';

export interface RoleTemplateItemInput {
  roleId: RoleId;
  requiredCount: number;
}

export interface CreateRoleTemplateInput {
  ministryId: MinistryId;
  name: string;
  items: RoleTemplateItemInput[];
}

export interface UpdateRoleTemplateInput {
  name?: string;
  items?: RoleTemplateItemInput[];
}

export interface RoleTemplateRepository {
  listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<RoleTemplate[]>;

  getById(
    churchId: ChurchId,
    id: RoleTemplateId,
    tx?: TransactionContext,
  ): Promise<RoleTemplate>;

  create(
    churchId: ChurchId,
    input: CreateRoleTemplateInput,
    tx?: TransactionContext,
  ): Promise<RoleTemplate>;

  update(
    churchId: ChurchId,
    id: RoleTemplateId,
    input: UpdateRoleTemplateInput,
    tx?: TransactionContext,
  ): Promise<RoleTemplate>;

  deleteById(
    churchId: ChurchId,
    id: RoleTemplateId,
    tx?: TransactionContext,
  ): Promise<void>;
}
