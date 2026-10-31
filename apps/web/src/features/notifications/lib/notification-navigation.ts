import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';

export type NotificationNavigationTarget =
  | { to: '/notifications' }
  | {
      to: '/invitations/ministry/$invitationId';
      params: { invitationId: string };
    }
  | {
      to: '/dashboard';
      search: {
        section: 'availability' | 'assignments';
        eventId?: string;
        ministryId?: string;
      };
    };

export interface NotificationDestination {
  target: NotificationNavigationTarget;
  /** The notification had no destination this build can resolve. */
  isFallback: boolean;
}

/**
 * Resolves a Notification to its destination from its kind and identifiers.
 * It never authorizes anything: the destination checks access itself. A kind
 * with no destination falls back to the Notifications page.
 */
export function resolveNotificationDestination(
  item: GetNotifications200ItemsItem,
): NotificationDestination {
  switch (item.kind) {
    case 'ministry_invitation':
      return {
        target: {
          to: '/invitations/ministry/$invitationId',
          params: { invitationId: item.data.ministryInvitationId },
        },
        isFallback: false,
      };
    case 'availability_opened':
    case 'availability_reminder':
      return {
        target: { to: '/dashboard', search: { section: 'availability' } },
        isFallback: false,
      };
    case 'schedule_published':
      return {
        target: {
          to: '/dashboard',
          search: {
            section: 'assignments',
            eventId: item.data.eventId,
            ministryId: item.data.ministryId,
          },
        },
        isFallback: false,
      };
    default:
      return { target: { to: '/notifications' }, isFallback: true };
  }
}

export interface OpenNotificationDestinationInput {
  item: GetNotifications200ItemsItem;
  navigate: (target: NotificationNavigationTarget) => void;
}

/** Follows a Notification to its destination, or says why it could not. */
export function openNotificationDestination({
  item,
  navigate,
}: OpenNotificationDestinationInput): void {
  const { target, isFallback } = resolveNotificationDestination(item);
  navigate(target);
  if (isFallback) toast.info(m.notification_open_unavailable());
}
