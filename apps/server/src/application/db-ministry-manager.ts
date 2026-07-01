import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { IMinistryManager } from '../domain/contracts/ministry-manager';
import type { ChurchId } from '../domain/entities/church';
import type { Ministry } from '../domain/entities/ministry';
import type { VolunteerId } from '../domain/entities/volunteer';
import type { MinistryRepository } from './contracts/ministry.repository';
import type { VolunteerRepository } from './contracts/volunteer.repository';

@injectable()
export class DbMinistryManager implements IMinistryManager {
  constructor(
    @inject('IMinistryRepository')
    private readonly ministryRepo: MinistryRepository,
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
  ) {}

  async listByLeader(input: {
    leaderId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Ministry[]> {
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
}
