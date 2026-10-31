import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KIND_OPTIONS,
  notificationRequestDataSchemas,
} from '@/domain/notification-kinds';

describe('notification kinds', () => {
  it('keeps the retained scheduling kinds and none of the dropped ones', () => {
    expect([...NOTIFICATION_KIND_OPTIONS].sort()).toEqual([
      'availability_opened',
      'availability_reminder',
      'ministry_invitation',
      'schedule_published',
    ]);
    for (const dropped of [
      'assignment_added',
      'assignment_changed',
      'assignment_removed',
      'availability_conflict',
      'assignment_reminder',
    ]) {
      expect(NOTIFICATION_KIND_OPTIONS).not.toContain(dropped);
    }
  });

  it('enqueues identifiers only, rejecting anything else', () => {
    const ids = {
      cycleId: '11111111-1111-4111-8111-111111111111',
      ministryId: '22222222-2222-4222-8222-222222222222',
    };

    expect(
      notificationRequestDataSchemas.availability_opened.parse(ids),
    ).toEqual(ids);
    expect(() =>
      notificationRequestDataSchemas.availability_opened.parse({
        ...ids,
        ministryId: 'Worship',
      }),
    ).toThrow();
    expect(() =>
      notificationRequestDataSchemas.schedule_published.parse({}),
    ).toThrow();
  });
});
