import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';

export type NotificationNavigationTarget =
  | { to: '/notifications' }
  | { to: '/my-schedule' }
  | { to: '/my-schedule/$assignmentId'; params: { assignmentId: string } }
  | { to: '/availability' }
  | { to: '/availability/$checkId'; params: { checkId: string } }
  | {
      to: '/invitations/ministry/$invitationId';
      params: { invitationId: string };
    }
  | {
      to: '/schedules/$ministryId/$cycleId';
      params: { ministryId: string; cycleId: string };
    }
  | {
      to: '/schedules/$ministryId/$cycleId/assign';
      params: { ministryId: string; cycleId: string };
      search: { swapRequest: string };
    }
  | {
      to: '/schedules';
      search: { cycleId: string; ministryIds: string };
    }
  | {
      to: '/dashboard';
      search: {
        section: 'assignments';
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
    case 'availability_reminder': {
      const { checkId } = item.data;
      return {
        target: checkId
          ? {
              to: '/availability/$checkId',
              params: { checkId },
            }
          : { to: '/availability' },
        isFallback: false,
      };
    }
    case 'schedule_published':
    case 'schedule_updated':
    case 'event_cancelled':
      return { target: { to: '/my-schedule' }, isFallback: false };
    case 'swap_request': {
      const { ministryId, cycleId, swapRequestId } = item.data;
      return {
        target: {
          to: '/schedules/$ministryId/$cycleId/assign',
          params: { ministryId, cycleId },
          // The same deep link the email carries.
          search: { swapRequest: swapRequestId },
        },
        isFallback: false,
      };
    }
    case 'event_changed':
    case 'cycle_ready_to_prepare': {
      const { cycleId, ministries } = item.data;
      const [only, ...others] = ministries;
      // One Ministry opens its Schedule; several open the Cycle-keeping picker.
      return {
        target:
          only && others.length === 0
            ? {
                to: '/schedules/$ministryId/$cycleId',
                params: { ministryId: only.id, cycleId },
              }
            : {
                to: '/schedules',
                search: {
                  cycleId,
                  ministryIds: ministries.map(({ id }) => id).join(','),
                },
              },
        isFallback: false,
      };
    }
    case 'swap_request_answered':
      return {
        target: {
          to: '/my-schedule/$assignmentId',
          params: { assignmentId: item.data.assignmentId },
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
