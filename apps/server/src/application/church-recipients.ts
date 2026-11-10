import type { MinistryId, UserId } from '../domain/branded-ids';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  EventChangedRecipient,
  EventChangedRecipientsInput,
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

  async eventChangedRecipients({
    tx,
    churchId,
    ministryIds,
    actingUserId,
  }: EventChangedRecipientsInput): Promise<EventChangedRecipient[]> {
    const [leaderships, adminUserIds] = await Promise.all([
      this.volunteerRepository.listActiveMinistryLeaderships({ churchId, tx }),
      this.churchRepository.listAdminUserIds({ id: churchId, tx }),
    ]);
    const fallbackUserIds = adminUserIds.filter(
      (userId) => userId !== actingUserId,
    );
    const ministryIdsByUser = new Map<UserId, MinistryId[]>();
    for (const ministryId of ministryIds) {
      const leaders = leaderships
        .filter((leadership) => leadership.ministryId === ministryId)
        .map(({ userId }) => userId);
      const told = leaders.length > 0 ? leaders : fallbackUserIds;
      for (const userId of new Set(told)) {
        ministryIdsByUser.set(userId, [
          ...(ministryIdsByUser.get(userId) ?? []),
          ministryId,
        ]);
      }
    }
    return [...ministryIdsByUser].map(([userId, userMinistryIds]) => ({
      userId,
      churchId,
      ministryIds: userMinistryIds,
    }));
  }
}
