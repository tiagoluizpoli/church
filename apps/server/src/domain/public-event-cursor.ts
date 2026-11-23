import { type Instant, isInstant, parseInstant } from '@church/time';
import type { PublicEventCursor } from './entities/public-event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque, URL-safe `(start, eventId)` position of the last Public Event of a page. */
export function encodePublicEventCursor({
  start,
  eventId,
}: PublicEventCursor): string {
  return Buffer.from(`${start}|${eventId}`).toString('base64url');
}

export interface DecodePublicEventCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodePublicEventCursor` could not have produced. */
export function decodePublicEventCursor({
  cursor,
}: DecodePublicEventCursorInput): PublicEventCursor | undefined {
  const [start, eventId, ...rest] = Buffer.from(cursor, 'base64url')
    .toString()
    .split('|');
  if (rest.length > 0 || !start || !eventId || !UUID.test(eventId))
    return undefined;
  if (!isInstant({ value: start })) return undefined;
  return { start: parseInstant({ value: start }) as Instant, eventId };
}
