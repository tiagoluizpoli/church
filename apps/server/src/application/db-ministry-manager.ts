import type {
  IMinistryManager,
  ListMinistriesByLeaderInput,
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
  constructor({ ministryRepo, volunteerRepo }: DbMinistryManagerDependencies) {
    this.ministryRepo = ministryRepo;
    this.volunteerRepo = volunteerRepo;
  }

  private readonly ministryRepo: MinistryRepository;
  private readonly volunteerRepo: VolunteerRepository;

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
