import { decodeListCursor, encodeListCursor } from './list-cursor';

export interface AnswersListCursorPosition {
  name: string;
  id: string;
}

/** Opaque, URL-safe `(volunteer name, volunteer id)` position. */
export function encodeAnswersListCursor({
  name,
  id,
}: AnswersListCursorPosition): string {
  return encodeListCursor({ owner: 'answers', fields: [name, id] });
}

export interface DecodeAnswersListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodeAnswersListCursor` could not have produced. */
export function decodeAnswersListCursor({
  cursor,
}: DecodeAnswersListCursorInput): AnswersListCursorPosition | undefined {
  const fields = decodeListCursor({ owner: 'answers', cursor, size: 2 });
  const [name, id] = fields ?? [];
  return name !== undefined && id ? { name, id } : undefined;
}
