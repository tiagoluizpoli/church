import type { AssignmentId } from '../entities/assignment';
import type { ChurchId } from '../entities/church';
import type { EventId } from '../entities/event';
import type { MinistryId } from '../entities/ministry';
import type { VolunteerId } from '../entities/volunteer';
import type {
  VolunteerNotification,
  VolunteerNotificationId,
  VolunteerNotificationPayload,
  VolunteerNotificationType,
} from '../entities/volunteer-notification';
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
