import { m } from '@church/i18n/messages';
import { pluralMessage } from '@/shared/utils/plural';

export function notificationUnreadLabel(count: number): string {
  return pluralMessage({
    count,
    one: () => m.notification_unread_one(),
    other: () => m.notification_unread_other({ count }),
  });
}
