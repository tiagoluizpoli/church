import { decodeListCursor, encodeListCursor } from './list-cursor';

export interface MinistryListCursorPosition {
  name: string;
  id: string;
}

/** Opaque, URL-safe `(name, Ministry id)` position. */
export function encodeMinistryListCursor({
  name,
  id,
}: MinistryListCursorPosition): string {
  return encodeListCursor({ owner: 'ministries', fields: [name, id] });
}

export interface DecodeMinistryListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodeMinistryListCursor` could not have produced. */
export function decodeMinistryListCursor({
  cursor,
}: DecodeMinistryListCursorInput): MinistryListCursorPosition | undefined {
  const fields = decodeListCursor({ owner: 'ministries', cursor, size: 2 });
  const [name, id] = fields ?? [];
  return name !== undefined && id ? { name, id } : undefined;
}
