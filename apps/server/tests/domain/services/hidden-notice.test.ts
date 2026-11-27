import { describe, expect, it } from 'vitest';
import { Notification } from '@/domain/entities/notification';
import {
  noticeScope,
  wordedForHiddenChoice,
} from '@/domain/services/hidden-notice';

const NOTHING_HIDDEN = { eventIds: [], eventTimeBlockIds: [] };

function notice(props: object) {
  return new Notification({ props: props as never, id: 'notice' });
}

const shift = { eventTitle: 'Vigil', roleName: 'Usher' };
const cancelled = notice({
  kind: 'event_cancelled',
  data: {
    eventId: 'event',
    eventTimeBlockId: 'block',
    eventTitle: 'Vigil',
    shifts: [shift],
    hidden: true,
  },
});

describe('wordedForHiddenChoice', () => {
  it.each([
    { eventIds: ['event'], eventTimeBlockIds: [] },
    { eventIds: [], eventTimeBlockIds: ['block'] },
  ])('drops every title while %j is hidden', (hidden) => {
    const { payload } = wordedForHiddenChoice({
      notification: cancelled,
      hidden,
    });

    expect(payload.data).toEqual({
      eventId: 'event',
      eventTimeBlockId: 'block',
      eventTitle: '',
      shifts: [{ eventTitle: '', roleName: 'Usher' }],
      hidden: true,
    });
  });

  it('keeps the title once shown, whatever the email was queued with', () => {
    const { payload } = wordedForHiddenChoice({
      notification: cancelled,
      hidden: NOTHING_HIDDEN,
    });

    expect(payload.data).toEqual({
      eventId: 'event',
      eventTimeBlockId: 'block',
      eventTitle: 'Vigil',
      shifts: [shift],
    });
  });

  it('leaves any other kind of notice alone', () => {
    const other = notice({ kind: 'schedule_published', data: {} });

    expect(noticeScope({ notification: other })).toBeNull();
    expect(
      wordedForHiddenChoice({ notification: other, hidden: NOTHING_HIDDEN }),
    ).toBe(other);
  });
});
