import { NotFoundError } from '@church/core';
import type { ChurchId } from '../domain/branded-ids';
import type {
  CreateMinistryInput,
  GetActiveMinistryInput,
  IMinistryManager,
  ListMinistriesByLeaderInput,
  RenameMinistryInput,
  SetDefaultDirectionInput,
} from '../domain/contracts/application/ministry-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Ministry } from '../domain/entities/ministry';

interface DbMinistryManagerDependencies {
  ministryRepo: MinistryRepository;
  volunteerRepo: VolunteerRepository;
}

export class DbMinistryManager implements IMinistryManager {
  private readonly ministryRepo: MinistryRepository;
  private readonly volunteerRepo: VolunteerRepository;

  constructor({ ministryRepo, volunteerRepo }: DbMinistryManagerDependencies) {
    this.ministryRepo = ministryRepo;
    this.volunteerRepo = volunteerRepo;
  }

  async listByChurch(churchId: ChurchId): Promise<Ministry[]> {
    return this.ministryRepo.listByChurch({ churchId });
  }

  async listByLeader(input: ListMinistriesByLeaderInput): Promise<Ministry[]> {
    const { leaderId, churchId } = input;
    const ledMinistries = await this.volunteerRepo.listLedMinistries({
      churchId,
      volunteerId: leaderId,
    });
    const ids = ledMinistries.map((led) => led.ministryId);
    return this.ministryRepo.listByChurch({ churchId, ids });
  }

  async getActive({
    churchId,
    ministryId,
  }: GetActiveMinistryInput): Promise<Ministry> {
    const ministry = await this.ministryRepo.getById({
      churchId,
      id: ministryId,
    });
    if (ministry.deletedAt) {
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    }
    return ministry;
  }

  async create(input: CreateMinistryInput): Promise<Ministry> {
    return this.ministryRepo.create(input);
  }

  async rename(input: RenameMinistryInput): Promise<Ministry> {
    return this.ministryRepo.rename(input);
  }

  async setDefaultDirection(
    input: SetDefaultDirectionInput,
  ): Promise<Ministry> {
    return this.ministryRepo.updateDefaultDirection(input);
  }
}
