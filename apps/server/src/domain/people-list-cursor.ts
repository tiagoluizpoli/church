import { decodeListCursor, encodeListCursor } from './list-cursor';

export interface PeopleListCursorPosition {
  name: string;
  id: string;
}

/** Opaque, URL-safe `(name, member id)` position. */
export function encodePeopleListCursor({
  name,
  id,
}: PeopleListCursorPosition): string {
  return encodeListCursor({ owner: 'people', fields: [name, id] });
}

export interface DecodePeopleListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodePeopleListCursor` could not have produced. */
export function decodePeopleListCursor({
  cursor,
}: DecodePeopleListCursorInput): PeopleListCursorPosition | undefined {
  const fields = decodeListCursor({ owner: 'people', cursor, size: 2 });
  const [name, id] = fields ?? [];
  return name !== undefined && id ? { name, id } : undefined;
}
