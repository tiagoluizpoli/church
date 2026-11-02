import type { Instant } from '@church/time';
import type { ChurchId, MinistryId, RoleId } from '../../branded-ids';
import type { Role } from '../../entities/role';
import type { ArchiveBlocker } from '../../errors/archive-blocked';
import type { TransactionContext } from './transaction-context';

/**
 * `getById` and `listByMinistry` are historical reads: they resolve archived
 * Roles too. Fresh use goes through `listActiveByMinistry` or
 * `lockActiveForUse`.
 */
export interface RoleRepository {
  getById(input: GetRoleByIdInput): Promise<Role>;

  listByMinistry(input: ListRolesByMinistryInput): Promise<Role[]>;

  /** Active Roles, alphabetical ignoring case. */
  listActiveByMinistry(input: ListRolesByMinistryInput): Promise<Role[]>;

  /** `RoleNameInUseError` when an active Role of the Ministry has the name, ignoring case. */
  create(input: CreateRoleRecordInput): Promise<Role>;

  /** `NotFoundError` unless active in the Ministry; name refusal as `create`. */
  rename(input: RenameRoleRecordInput): Promise<Role>;

  /**
   * The requested Roles that are active in the Ministry, share-locked until
   * `tx` ends so a concurrent archive waits for this fresh use to commit.
   */
  lockActiveForUse(input: LockActiveRolesForUseInput): Promise<Role[]>;

  /** The active Role, update-locked against concurrent fresh use; else `NotFoundError`. */
  lockActiveForArchive(input: LockActiveRoleForArchiveInput): Promise<Role>;

  /** Upcoming ShiftRequirements and retained UsualSetup headcounts using the Role. */
  listArchiveBlockers(
    input: ListRoleArchiveBlockersInput,
  ): Promise<ArchiveBlocker[]>;

  archive(input: ArchiveRoleRecordInput): Promise<void>;
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

export interface CreateRoleRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
  tx?: TransactionContext;
}

export interface RenameRoleRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleId: RoleId;
  name: string;
  tx?: TransactionContext;
}

export interface LockActiveRolesForUseInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleIds: string[];
  tx: TransactionContext;
}

export interface LockActiveRoleForArchiveInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  roleId: RoleId;
  tx: TransactionContext;
}

export interface ListRoleArchiveBlockersInput {
  churchId: ChurchId;
  roleId: RoleId;
  /** Events ending after this Instant, including in-progress ones, block. */
  now: Instant;
  tx: TransactionContext;
}

export interface ArchiveRoleRecordInput {
  churchId: ChurchId;
  roleId: RoleId;
  archivedAt: Instant;
  tx: TransactionContext;
}
