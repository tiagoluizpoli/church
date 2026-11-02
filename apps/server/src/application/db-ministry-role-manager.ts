import { NotFoundError } from '@church/core';
import { now } from '@church/time';
import type { ChurchId, MinistryId } from '../domain/branded-ids';
import type {
  ArchiveMinistryRoleInput,
  CreateMinistryRoleInput,
  IMinistryRoleManager,
  ListMinistryRolesInput,
  RenameMinistryRoleInput,
} from '../domain/contracts/application/ministry-role-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Role } from '../domain/entities/role';
import { RoleInUseError } from '../domain/errors/role-in-use';

interface DbMinistryRoleManagerDependencies {
  ministryRepository: MinistryRepository;
  roleRepository: RoleRepository;
  unitOfWork: UnitOfWork;
}

interface EnsureActiveMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export class DbMinistryRoleManager implements IMinistryRoleManager {
  private readonly ministryRepository: MinistryRepository;
  private readonly roleRepository: RoleRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    ministryRepository,
    roleRepository,
    unitOfWork,
  }: DbMinistryRoleManagerDependencies) {
    this.ministryRepository = ministryRepository;
    this.roleRepository = roleRepository;
    this.unitOfWork = unitOfWork;
  }

  async list(input: ListMinistryRolesInput): Promise<Role[]> {
    await this.ensureActiveMinistry(input);
    return this.roleRepository.listActiveByMinistry(input);
  }

  async create(input: CreateMinistryRoleInput): Promise<Role> {
    await this.ensureActiveMinistry(input);
    return this.roleRepository.create(input);
  }

  async rename(input: RenameMinistryRoleInput): Promise<Role> {
    await this.ensureActiveMinistry(input);
    return this.roleRepository.rename(input);
  }

  async archive({
    churchId,
    ministryId,
    roleId,
  }: ArchiveMinistryRoleInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
      await this.ensureActiveMinistry({ churchId, ministryId, tx });
      // The update lock makes fresh-use writes (which share-lock the Role)
      // either commit before the blocker read or see the archive and refuse.
      await this.roleRepository.lockActiveForArchive({
        churchId,
        ministryId,
        roleId,
        tx,
      });
      const at = now();
      const blockers = await this.roleRepository.listArchiveBlockers({
        churchId,
        roleId,
        now: at,
        tx,
      });
      if (blockers.length > 0) throw new RoleInUseError({ blockers });
      await this.roleRepository.archive({
        churchId,
        roleId,
        archivedAt: at,
        tx,
      });
    });
  }

  private async ensureActiveMinistry({
    churchId,
    ministryId,
    tx,
  }: EnsureActiveMinistryInput): Promise<void> {
    const ministry = await this.ministryRepository.getById({
      churchId,
      id: ministryId,
      tx,
    });
    if (ministry.deletedAt) {
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    }
  }
}
