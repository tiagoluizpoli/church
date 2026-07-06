import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ChurchId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../branded-ids';
import type { VolunteerNotificationType } from '../../entities/volunteer-notification';
import type { VolunteerNotificationRepository } from '../infrastructure/volunteer-notification.repository';

const TEST_CHURCH_ID = '11111111-1111-1111-1111-111111111111' as ChurchId;
const TEST_VOLUNTEER_ID = '44444444-4444-4444-4444-444444444441' as VolunteerId;
const OTHER_VOLUNTEER_ID =
  '44444444-4444-4444-4444-444444444442' as VolunteerId;
const FIRST_NOTIFICATION_ID =
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as VolunteerNotificationId;
const SECOND_NOTIFICATION_ID =
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as VolunteerNotificationId;
const THIRD_NOTIFICATION_ID =
  'cccccccc-cccc-cccc-cccc-cccccccccccc' as VolunteerNotificationId;
const TEST_TYPE = 'assignment_changed' as VolunteerNotificationType;

export function runVolunteerNotificationRepositoryContractTests(
  factory: () => Promise<VolunteerNotificationRepository>,
  cleanup: () => Promise<void>,
) {
  describe('VolunteerNotificationRepository Contract', () => {
    let repo: VolunteerNotificationRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should create a volunteer notification', async () => {
      const created = await repo.create(TEST_CHURCH_ID, {
        volunteerId: TEST_VOLUNTEER_ID,
        type: TEST_TYPE,
        title: 'Assignment updated',
        body: 'Your assignment changed.',
        payload: {
          assignmentId: '99999999-9999-9999-9999-999999999991',
          eventId: '66666666-6666-6666-6666-666666666661',
          section: 'assignments',
        },
      });

      expect(created.id).toBeDefined();
      expect(created.volunteerId).toBe(TEST_VOLUNTEER_ID);
      expect(created.type).toBe(TEST_TYPE);
      expect(created.title).toBe('Assignment updated');
      expect(created.readAt).toBeUndefined();
    });

    it('should list volunteer notifications newest first', async () => {
      const result = await repo.listByVolunteer(TEST_CHURCH_ID, {
        volunteerId: TEST_VOLUNTEER_ID,
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.id)).toEqual([
        SECOND_NOTIFICATION_ID,
        FIRST_NOTIFICATION_ID,
      ]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should page volunteer notifications by cursor', async () => {
      const firstPage = await repo.listByVolunteer(TEST_CHURCH_ID, {
        volunteerId: TEST_VOLUNTEER_ID,
        limit: 1,
      });

      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.items[0]?.id).toBe(SECOND_NOTIFICATION_ID);
      expect(firstPage.nextCursor?.toISOString()).toBe(
        '2024-06-02T12:00:00.000Z',
      );

      const secondPage = await repo.listByVolunteer(TEST_CHURCH_ID, {
        volunteerId: TEST_VOLUNTEER_ID,
        cursor: firstPage.nextCursor,
        limit: 1,
      });

      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]?.id).toBe(FIRST_NOTIFICATION_ID);
      expect(secondPage.nextCursor).toBeUndefined();
    });

    it('should count only unread notifications for volunteer', async () => {
      const count = await repo.countUnread(TEST_CHURCH_ID, TEST_VOLUNTEER_ID);

      expect(count).toBe(1);
    });

    it('should mark a notification as read', async () => {
      const readAt = await repo.markRead(
        TEST_CHURCH_ID,
        TEST_VOLUNTEER_ID,
        FIRST_NOTIFICATION_ID,
      );

      expect(readAt).toBeInstanceOf(Date);

      const result = await repo.listByVolunteer(TEST_CHURCH_ID, {
        volunteerId: TEST_VOLUNTEER_ID,
        limit: 10,
      });

      const updated = result.items.find(
        (item) => item.id === FIRST_NOTIFICATION_ID,
      );
      expect(updated?.readAt?.toISOString()).toBe(readAt?.toISOString());
    });

    it('should mark all unread notifications as read for one volunteer only', async () => {
      const updatedCount = await repo.markAllRead(
        TEST_CHURCH_ID,
        TEST_VOLUNTEER_ID,
      );

      expect(updatedCount).toBe(1);
      expect(await repo.countUnread(TEST_CHURCH_ID, TEST_VOLUNTEER_ID)).toBe(0);
      expect(await repo.countUnread(TEST_CHURCH_ID, OTHER_VOLUNTEER_ID)).toBe(
        1,
      );

      const otherVolunteerResult = await repo.listByVolunteer(TEST_CHURCH_ID, {
        volunteerId: OTHER_VOLUNTEER_ID,
        limit: 10,
      });

      expect(otherVolunteerResult.items[0]?.id).toBe(THIRD_NOTIFICATION_ID);
      expect(otherVolunteerResult.items[0]?.readAt).toBeUndefined();
    });
  });
}
