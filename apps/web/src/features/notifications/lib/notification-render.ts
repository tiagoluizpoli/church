import { m } from '@church/i18n/messages';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';

export interface RenderedNotification {
  title: string;
  body: string;
  kindLabel: string;
}

/**
 * Words for a Notification, rendered at read time from its kind and frozen
 * data, so the cached history follows a locale change. A kind this build does
 * not know yet (a later Flow, or a stale client) stays readable.
 */
export function renderNotification(
  item: GetNotifications200ItemsItem,
): RenderedNotification {
  switch (item.kind) {
    case 'ministry_invitation':
      return {
        title: m.notification_ministry_invitation_title({
          ministryName: item.data.ministryName,
        }),
        body: m.notification_ministry_invitation_body({
          ministryName: item.data.ministryName,
        }),
        kindLabel: m.notification_kind_ministry_invitation(),
      };
    default:
      return {
        title: m.notification_unknown_title(),
        body: m.notification_unknown_body(),
        kindLabel: m.notification_unknown_kind(),
      };
  }
}
