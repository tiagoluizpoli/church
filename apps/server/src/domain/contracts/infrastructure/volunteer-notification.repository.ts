import type {
  AssignmentId,
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../branded-ids';
import type {
  VolunteerNotification,
  VolunteerNotificationPayload,
  VolunteerNotificationType,
} from '../../entities/volunteer-notification';
import type { TransactionContext } from './transaction-context';

export interface CreateVolunteerNotificationInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  cycleId?: CycleId;
  ministryId?: MinistryId;
  eventId?: EventId;
  assignmentId?: AssignmentId;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: VolunteerNotificationPayload;
  tx?: TransactionContext;
}

export interface VolunteerNotificationListInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  cursor?: Date;
  limit: number;
  tx?: TransactionContext;
}

export interface VolunteerNotificationListResult {
  items: VolunteerNotification[];
  nextCursor?: Date;
}

export interface VolunteerNotificationRepository {
  create(
    input: CreateVolunteerNotificationInput,
  ): Promise<VolunteerNotification>;

  listByVolunteer(
    input: VolunteerNotificationListInput,
  ): Promise<VolunteerNotificationListResult>;

  countUnread(input: CountUnreadVolunteerNotificationsInput): Promise<number>;

  markRead(input: MarkVolunteerNotificationReadInput): Promise<Date | null>;

  markAllRead(input: MarkAllVolunteerNotificationsReadInput): Promise<number>;
}

export interface CountUnreadVolunteerNotificationsInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface MarkVolunteerNotificationReadInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  notificationId: VolunteerNotificationId;
  tx?: TransactionContext;
}

export interface MarkAllVolunteerNotificationsReadInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}
