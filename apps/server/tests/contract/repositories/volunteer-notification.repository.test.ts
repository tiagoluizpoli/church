import type {
  AssignmentId,
  ChurchId,
  EventId,
  MinistryId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../../src/domain/branded-ids';
import { runVolunteerNotificationRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/volunteer-notification.contract-spec';
import type {
  CreateVolunteerNotificationInput,
  VolunteerNotificationListInput,
  VolunteerNotificationListResult,
  VolunteerNotificationRepository,
} from '../../../src/domain/contracts/infrastructure/volunteer-notification.repository';
import type {
  VolunteerNotificationPayload,
  VolunteerNotificationType,
} from '../../../src/domain/entities/volunteer-notification';
import { VolunteerNotification } from '../../../src/domain/entities/volunteer-notification';

const TEST_CHURCH_ID = '11111111-1111-1111-1111-111111111111' as ChurchId;
const TEST_VOLUNTEER_ID = '44444444-4444-4444-4444-444444444441' as VolunteerId;
const OTHER_VOLUNTEER_ID =
  '44444444-4444-4444-4444-444444444442' as VolunteerId;

interface SeedNotificationInput {
  id: VolunteerNotificationId;
  churchId: ChurchId;
  volunteerId: VolunteerId;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: VolunteerNotificationPayload;
  createdAt: Date;
  readAt?: Date;
  ministryId?: MinistryId;
  eventId?: EventId;
  assignmentId?: AssignmentId;
}

class MockVolunteerNotificationRepository
  implements VolunteerNotificationRepository
{
  private notifications = new Map<string, VolunteerNotification>();
  private idCounter = 1;

  constructor() {
    const seedNotifications: SeedNotificationInput[] = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as VolunteerNotificationId,
        churchId: TEST_CHURCH_ID,
        volunteerId: TEST_VOLUNTEER_ID,
        type: 'assignment_changed',
        title: 'Assignment updated',
        body: 'Your assignment time changed.',
        payload: {
          assignmentId: '99999999-9999-9999-9999-999999999991',
          eventId: '66666666-6666-6666-6666-666666666661',
          section: 'assignments',
        },
        createdAt: new Date('2024-06-01T12:00:00Z'),
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as VolunteerNotificationId,
        churchId: TEST_CHURCH_ID,
        volunteerId: TEST_VOLUNTEER_ID,
        type: 'assignment_removed',
        title: 'Assignment removed',
        body: 'You are no longer scheduled for this slot.',
        payload: {
          eventId: '66666666-6666-6666-6666-666666666661',
          section: 'notifications',
        },
        createdAt: new Date('2024-06-02T12:00:00Z'),
        readAt: new Date('2024-06-02T13:00:00Z'),
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' as VolunteerNotificationId,
        churchId: TEST_CHURCH_ID,
        volunteerId: OTHER_VOLUNTEER_ID,
        type: 'assignment_reminder',
        title: 'Reminder',
        body: 'Reminder for upcoming assignment.',
        payload: {
          assignmentId: '99999999-9999-9999-9999-999999999992',
          section: 'assignments',
        },
        createdAt: new Date('2024-06-03T12:00:00Z'),
      },
    ];

    for (const input of seedNotifications) {
      const notification = this.createNotification(input);
      this.notifications.set(notification.id, notification);
    }
  }

  async create(
    churchId: ChurchId,
    input: CreateVolunteerNotificationInput,
  ): Promise<VolunteerNotification> {
    const notification = this.createNotification({
      id: `notification-gen-${this.idCounter++}` as VolunteerNotificationId,
      churchId,
      volunteerId: input.volunteerId,
      ministryId: input.ministryId,
      eventId: input.eventId,
      assignmentId: input.assignmentId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload,
      createdAt: new Date(),
    });

    if (notification.churchId !== churchId) {
      throw new Error('Church mismatch');
    }

    this.notifications.set(notification.id, notification);
    return notification;
  }

  async listByVolunteer(
    churchId: ChurchId,
    input: VolunteerNotificationListInput,
  ): Promise<VolunteerNotificationListResult> {
    const matching = Array.from(this.notifications.values())
      .filter(
        (notification) =>
          notification.churchId === churchId &&
          notification.volunteerId === input.volunteerId &&
          (!input.cursor || notification.createdAt < input.cursor),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );

    const items = matching.slice(0, input.limit);
    const nextItem = matching.at(input.limit);

    return {
      items,
      nextCursor: nextItem ? items.at(-1)?.createdAt : undefined,
    };
  }

  async countUnread(
    churchId: ChurchId,
    volunteerId: VolunteerId,
  ): Promise<number> {
    return Array.from(this.notifications.values()).filter(
      (notification) =>
        notification.churchId === churchId &&
        notification.volunteerId === volunteerId &&
        !notification.readAt,
    ).length;
  }

  async markRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    notificationId: VolunteerNotificationId,
  ): Promise<Date | null> {
    const notification = this.notifications.get(notificationId);
    const readAt = new Date();

    if (
      !notification ||
      notification.churchId !== churchId ||
      notification.volunteerId !== volunteerId
    ) {
      return null;
    }

    this.notifications.set(
      notification.id,
      this.createNotification({
        id: notification.id,
        churchId: notification.churchId,
        volunteerId: notification.volunteerId,
        ministryId: notification.ministryId,
        eventId: notification.eventId,
        assignmentId: notification.assignmentId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        createdAt: notification.createdAt,
        readAt,
      }),
    );

    return readAt;
  }

  async markAllRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
  ): Promise<number> {
    let updatedCount = 0;

    for (const notification of this.notifications.values()) {
      if (
        notification.churchId !== churchId ||
        notification.volunteerId !== volunteerId ||
        notification.readAt
      ) {
        continue;
      }

      updatedCount += 1;
      this.notifications.set(
        notification.id,
        this.createNotification({
          id: notification.id,
          churchId: notification.churchId,
          volunteerId: notification.volunteerId,
          ministryId: notification.ministryId,
          eventId: notification.eventId,
          assignmentId: notification.assignmentId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payload: notification.payload,
          createdAt: notification.createdAt,
          readAt: new Date(),
        }),
      );
    }

    return updatedCount;
  }

  private createNotification(
    input: SeedNotificationInput,
  ): VolunteerNotification {
    return new VolunteerNotification(input, input.id);
  }
}

runVolunteerNotificationRepositoryContractTests(
  async () => new MockVolunteerNotificationRepository(),
  async () => {},
);
