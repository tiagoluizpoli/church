import { fromDate, isInstant, parseInstant, toDate } from '@church/time';
import {
  INVITATION_LIST_KIND_OPTIONS,
  type InvitationListKind,
} from './entities/invitation-list-item';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Church Invitation ids are Better Auth strings, not UUIDs.
const SAFE_ID = /^[\w-]{1,128}$/;

export interface InvitationListCursorPosition {
  createdAt: Date;
  kind: InvitationListKind;
  id: string;
}

/** Opaque, URL-safe `(createdAt, kind, id)` position: kind then id break equal-Instant ties. */
export function encodeInvitationListCursor({
  createdAt,
  kind,
  id,
}: InvitationListCursorPosition): string {
  return Buffer.from(`${fromDate({ date: createdAt })}|${kind}|${id}`).toString(
    'base64url',
  );
}

export interface DecodeInvitationListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodeInvitationListCursor` could not have produced. */
export function decodeInvitationListCursor({
  cursor,
}: DecodeInvitationListCursorInput): InvitationListCursorPosition | undefined {
  const [instant, kind, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString()
    .split('|');
  if (rest.length > 0 || !instant || !kind || !id) return undefined;
  if (!INVITATION_LIST_KIND_OPTIONS.includes(kind as InvitationListKind)) {
    return undefined;
  }
  if (!(kind === 'ministry' ? UUID.test(id) : SAFE_ID.test(id))) {
    return undefined;
  }
  if (!isInstant({ value: instant })) return undefined;
  return {
    createdAt: toDate({ instant: parseInstant({ value: instant }) }),
    kind: kind as InvitationListKind,
    id,
  };
}
