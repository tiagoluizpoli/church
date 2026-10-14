import { describe, expect, it } from 'vitest';
import { createNotificationServiceSpy } from '@/tests/test-support/notification-service-spy';

describe('createNotificationServiceSpy', () => {
  it('records notification calls', async () => {
    const spy = createNotificationServiceSpy();
    const event = {
      type: 'event_published' as const,
      churchId: 'church-a',
      eventId: 'event-a',
      actorId: 'actor-a',
      assignmentIds: ['assignment-a'],
    };

    await spy.publish(event);

    expect(spy.publish).toHaveBeenCalledWith(event);
  });
});
