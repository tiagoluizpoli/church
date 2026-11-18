import type { notification } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  NotificationId,
  UserId,
} from '../../domain/branded-ids';
import { Notification } from '../../domain/entities/notification';
import {
  isNotificationKind,
  type NotificationPayload,
  notificationKindDataSchemas,
} from '../../domain/notification-kinds';

type NotificationRow = InferSelectModel<typeof notification>;

/** Re-validates the persisted kind/data boundary so a corrupt row fails loudly. */
export function mapNotification(row: NotificationRow): Notification {
  if (!isNotificationKind(row.kind)) {
    throw new Error(`Unknown Notification kind ${row.kind}`);
  }
  const payload = {
    kind: row.kind,
    data: notificationKindDataSchemas[row.kind].parse(row.data),
  } as NotificationPayload;

  return new Notification({
    props: {
      ...payload,
      userId: row.userId as UserId,
      churchId: row.churchId as ChurchId,
      sourceOutboxId: row.sourceOutboxId,
      readAt: row.readAt ? fromDate({ date: row.readAt }) : undefined,
    },
    id: row.id as NotificationId,
    createdAt: row.createdAt,
  });
}
