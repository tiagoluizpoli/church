import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  IChurchRecipients,
  MinistryLeadersOrAdminsInput,
} from '../domain/contracts/application/church-recipients';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';

interface ChurchRecipientsDependencies {
  churchRepository: ChurchRepository;
  volunteerRepository: VolunteerRepository;
}

export class ChurchRecipients implements IChurchRecipients {
  private readonly churchRepository: ChurchRepository;
  private readonly volunteerRepository: VolunteerRepository;

  constructor({
    churchRepository,
    volunteerRepository,
  }: ChurchRecipientsDependencies) {
    this.churchRepository = churchRepository;
    this.volunteerRepository = volunteerRepository;
  }

  async ministryLeadersOrAdmins({
    tx,
    churchId,
    ministryId,
    excludeUserId,
  }: MinistryLeadersOrAdminsInput): Promise<ChurchRecipient[]> {
    const leaders = await this.volunteerRepository.listActiveLeaderUserIds({
      churchId,
      ministryId,
      tx,
    });
    const userIds =
      leaders.length > 0
        ? leaders
        : await this.churchRepository.listAdminUserIds({ id: churchId, tx });
    return [...new Set(userIds)]
      .filter((userId) => userId !== excludeUserId)
      .map((userId) => ({ userId, churchId }));
  }
}
