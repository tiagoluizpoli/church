import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  IMinistryManager,
  ListMinistriesByLeaderInput,
  SetDefaultDirectionInput,
} from '../domain/contracts/application/ministry-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Ministry } from '../domain/entities/ministry';

@injectable()
export class DbMinistryManager implements IMinistryManager {
  constructor(
    @inject('IMinistryRepository')
    private readonly ministryRepo: MinistryRepository,
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
  ) {}

  async listByLeader(input: ListMinistriesByLeaderInput): Promise<Ministry[]> {
    const { leaderId, churchId } = input;
    const ledMinistries = await this.volunteerRepo.listLedMinistries(
      churchId,
      leaderId,
    );
    const ministries = await Promise.all(
      ledMinistries.map((lm) =>
        this.ministryRepo.getById(churchId, lm.ministryId),
      ),
    );
    return ministries;
  }

  async setDefaultDirection(
    input: SetDefaultDirectionInput,
  ): Promise<Ministry> {
    return this.ministryRepo.updateDefaultDirection(input);
  }
}
