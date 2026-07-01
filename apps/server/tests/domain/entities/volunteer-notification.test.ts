import { describe, expect, it } from 'vitest';
import { VolunteerNotification } from '../../../src/domain/entities/volunteer-notification';

describe('VolunteerNotification', () => {
  const props = {
    churchId: 'church-1',
    volunteerId: 'volunteer-1',
    ministryId: 'ministry-1',
    eventId: 'event-1',
    assignmentId: 'assignment-1',
    type: 'assignment_added' as const,
    title: 'New assignment',
    body: 'You have a new assignment',
    payload: { section: 'schedule' },
  };

  it('defaults creation time and exposes properties', () => {
    const notification = new VolunteerNotification(props);

    expect(notification.churchId).toBe('church-1');
    expect(notification.volunteerId).toBe('volunteer-1');
    expect(notification.ministryId).toBe('ministry-1');
    expect(notification.eventId).toBe('event-1');
    expect(notification.assignmentId).toBe('assignment-1');
    expect(notification.type).toBe('assignment_added');
    expect(notification.title).toBe('New assignment');
    expect(notification.body).toBe('You have a new assignment');
    expect(notification.payload).toEqual({ section: 'schedule' });
    expect(notification.readAt).toBeUndefined();
    expect(notification.createdAt).toBeInstanceOf(Date);
  });

  it('preserves supplied creation and read times', () => {
    const createdAt = new Date('2026-07-01T10:00:00Z');
    const readAt = new Date('2026-07-01T11:00:00Z');
    const notification = new VolunteerNotification({
      ...props,
      createdAt,
      readAt,
    });

    expect(notification.createdAt).toBe(createdAt);
    expect(notification.readAt).toBe(readAt);
  });
});
