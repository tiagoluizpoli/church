import type { ChurchId, MinistryId, RoleId } from '../../branded-ids';
import type { Role } from '../../entities/role';

export interface ListMinistryRolesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface CreateMinistryRoleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export interface RenameMinistryRoleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleId: RoleId;
  name: string;
}

export interface ArchiveMinistryRoleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleId: RoleId;
}

/**
 * The Role registry of an active Ministry. Every operation answers
 * `NotFoundError` for an archived, missing or other-Church Ministry, and
 * for a Role that is archived or belongs to another Ministry.
 */
export interface IMinistryRoleManager {
  /** Active Roles, alphabetical ignoring case. */
  list(input: ListMinistryRolesInput): Promise<Role[]>;
  /** `RoleNameInUseError` when an active Role of the Ministry has the name, ignoring case. */
  create(input: CreateMinistryRoleInput): Promise<Role>;
  /** Same identity, new name, shown by every historical read. */
  rename(input: RenameMinistryRoleInput): Promise<Role>;
  /**
   * `RoleInUseError` with typed locations while an upcoming ShiftRequirement
   * or a UsualSetup headcount uses the Role. Qualifications, past
   * requirements and Assignments are kept and never block.
   */
  archive(input: ArchiveMinistryRoleInput): Promise<void>;
}
