import type { NotificationDeepLink } from '../hooks/use-notification-inbox';

export interface NotificationNavigationTarget {
  to: '/dashboard' | '/notifications';
  search?: Record<string, string | undefined>;
}

export function resolveNotificationTarget(
  deepLink: NotificationDeepLink,
): NotificationNavigationTarget {
  switch (deepLink.section) {
    case 'availability':
      return {
        to: '/dashboard',
        search: { section: 'availability', eventId: deepLink.eventId },
      };
    case 'assignments':
      return {
        to: '/dashboard',
        search: {
          section: 'assignments',
          eventId: deepLink.eventId,
          assignmentId: deepLink.assignmentId,
        },
      };
    case 'ministry_schedule':
      return {
        to: '/dashboard',
        search: {
          section: 'ministry_schedule',
          ministryId: deepLink.ministryId,
        },
      };
    default:
      return { to: '/notifications' };
  }
}
