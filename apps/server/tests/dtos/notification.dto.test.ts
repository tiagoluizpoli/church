import { describe, expect, it } from 'vitest';
import { notificationMapper } from '../../src/api/dtos/notification.dto';
import { VolunteerNotification } from '../../src/domain/entities/volunteer-notification';

function createFullNotification() {
  return new VolunteerNotification(
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '22222222-2222-2222-2222-222222222222',
      planningCycleId: '33333333-3333-3333-3333-333333333333',
      ministryId: '44444444-4444-4444-4444-444444444444',
      eventId: '55555555-5555-5555-5555-555555555555',
      assignmentId: '66666666-6666-6666-6666-666666666666',
      type: 'assignment_added',
      title: 'New assignment',
      body: 'You have a new assignment',
      payload: { assignmentId: '66666666-6666-6666-6666-666666666666' },
      readAt: new Date('2026-07-01T00:00:00.000Z'),
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
    },
    '77777777-7777-7777-7777-777777777777',
  );
}

function createMinimalNotification() {
  return new VolunteerNotification(
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '22222222-2222-2222-2222-222222222222',
      type: 'schedule_published',
      title: 'Schedule published',
      body: 'Your schedule is ready',
      payload: {},
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
    },
    '88888888-8888-8888-8888-888888888888',
  );
}

describe('notificationMapper', () => {
  it('maps a notification with all optional fields present', () => {
    const notification = createFullNotification();

    const response = notificationMapper.toResponse(notification);

    expect(response).toEqual({
      id: '77777777-7777-7777-7777-777777777777',
      volunteerId: '22222222-2222-2222-2222-222222222222',
      ministryId: '44444444-4444-4444-4444-444444444444',
      eventId: '55555555-5555-5555-5555-555555555555',
      assignmentId: '66666666-6666-6666-6666-666666666666',
      type: 'assignment_added',
      title: 'New assignment',
      body: 'You have a new assignment',
      payload: { assignmentId: '66666666-6666-6666-6666-666666666666' },
      readAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-06-30T00:00:00.000Z',
    });
  });

  it('maps a notification with all optional fields absent', () => {
    const notification = createMinimalNotification();

    const response = notificationMapper.toResponse(notification);

    expect(response.ministryId).toBeUndefined();
    expect(response.eventId).toBeUndefined();
    expect(response.assignmentId).toBeUndefined();
    expect(response.readAt).toBeUndefined();
    expect(response.type).toBe('schedule_published');
    expect(response.payload).toEqual({});
  });

  it('maps a list result with a nextCursor present', () => {
    const items = [createFullNotification(), createMinimalNotification()];

    const response = notificationMapper.listToResponse({
      items,
      nextCursor: new Date('2026-07-02T00:00:00.000Z'),
    });

    expect(response.items).toHaveLength(2);
    expect(response.nextCursor).toBe('2026-07-02T00:00:00.000Z');
  });

  it('maps a list result without a nextCursor', () => {
    const response = notificationMapper.listToResponse({
      items: [createMinimalNotification()],
    });

    expect(response.nextCursor).toBeUndefined();
    expect(response.items).toHaveLength(1);
  });

  it('maps a list result with an empty items array', () => {
    const response = notificationMapper.listToResponse({ items: [] });

    expect(response.items).toEqual([]);
    expect(response.nextCursor).toBeUndefined();
  });
});
