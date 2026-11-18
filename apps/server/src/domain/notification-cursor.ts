const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import { fromDate, isInstant, parseInstant, toDate } from '@church/time';

export interface NotificationCursorPosition {
  createdAt: Date;
  id: string;
}

/** Opaque, URL-safe `(createdAt, id)` position; `id` breaks equal-Instant ties. */
export function encodeNotificationCursor({
  createdAt,
  id,
}: NotificationCursorPosition): string {
  return Buffer.from(`${fromDate({ date: createdAt })}|${id}`).toString(
    'base64url',
  );
}

export interface DecodeNotificationCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodeNotificationCursor` could not have produced. */
export function decodeNotificationCursor({
  cursor,
}: DecodeNotificationCursorInput): NotificationCursorPosition | undefined {
  const [instant, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString()
    .split('|');
  if (rest.length > 0 || !instant || !id || !UUID.test(id)) return undefined;
  if (!isInstant({ value: instant })) return undefined;
  return {
    createdAt: toDate({ instant: parseInstant({ value: instant }) }),
    id,
  };
}
