import { afterEach, describe, expect, it } from 'vitest';
import {
  getDashboardSnapshotQueryConfig,
  getMinistryScheduleQueryConfig,
} from '@/features/volunteers/lib/dashboard-query-options';

describe('dashboard query options', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses cached dashboard data as placeholder while online', () => {
    window.localStorage.setItem(
      'volunteer-dashboard:snapshot',
      JSON.stringify({
        availabilityTasks: [{ eventId: 'event-1' }],
        upcomingAssignmentGroups: [],
        ministryOptions: [],
        notificationUnreadCount: 0,
        fetchedAt: '2026-06-30T12:00:00.000Z',
      }),
    );

    const config = getDashboardSnapshotQueryConfig(true);

    expect(config.initialData).toBeUndefined();
    expect(config.placeholderData?.()).toMatchObject({
      availabilityTasks: [{ eventId: 'event-1' }],
    });
    expect(config.refetchOnMount).toBe('always');
  });

  it('uses cached dashboard data as initial data while offline', () => {
    window.localStorage.setItem(
      'volunteer-dashboard:snapshot',
      JSON.stringify({
        availabilityTasks: [{ eventId: 'event-2' }],
        upcomingAssignmentGroups: [],
        ministryOptions: [],
        notificationUnreadCount: 0,
        fetchedAt: '2026-06-30T12:00:00.000Z',
      }),
    );

    const config = getDashboardSnapshotQueryConfig(false);

    expect(config.placeholderData).toBeUndefined();
    expect(config.initialData?.()).toMatchObject({
      availabilityTasks: [{ eventId: 'event-2' }],
    });
    expect(config.refetchOnMount).toBe(false);
  });

  it('uses cached ministry schedule as placeholder while online', () => {
    window.localStorage.setItem(
      'volunteer-dashboard:ministry-schedule:ministry-1',
      JSON.stringify({
        events: [{ eventId: 'event-1', eventName: 'Sunday Gathering' }],
      }),
    );

    const config = getMinistryScheduleQueryConfig('ministry-1', true);

    expect(config.initialData).toBeUndefined();
    expect(config.placeholderData?.()).toMatchObject({
      events: [{ eventId: 'event-1', eventName: 'Sunday Gathering' }],
    });
    expect(config.refetchOnMount).toBe('always');
  });
});
