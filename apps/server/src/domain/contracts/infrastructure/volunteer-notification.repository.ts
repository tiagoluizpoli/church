import type {
  AssignmentId,
  ChurchId,
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
  volunteerId: VolunteerId;
  ministryId?: MinistryId;
  eventId?: EventId;
  assignmentId?: AssignmentId;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: VolunteerNotificationPayload;
}

export interface VolunteerNotificationListInput {
  volunteerId: VolunteerId;
  cursor?: Date;
  limit: number;
}

export interface VolunteerNotificationListResult {
  items: VolunteerNotification[];
  nextCursor?: Date;
}

export interface VolunteerNotificationRepository {
  create(
    churchId: ChurchId,
    input: CreateVolunteerNotificationInput,
    tx?: TransactionContext,
  ): Promise<VolunteerNotification>;

  listByVolunteer(
    churchId: ChurchId,
    input: VolunteerNotificationListInput,
    tx?: TransactionContext,
  ): Promise<VolunteerNotificationListResult>;

  countUnread(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<number>;

  markRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    notificationId: VolunteerNotificationId,
    tx?: TransactionContext,
  ): Promise<Date | null>;

  markAllRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<number>;
}
