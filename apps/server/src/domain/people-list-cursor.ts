export interface PeopleListCursorPosition {
  name: string;
  id: string;
}

/** Opaque, URL-safe `(name, member id)` position. */
export function encodePeopleListCursor({
  name,
  id,
}: PeopleListCursorPosition): string {
  return Buffer.from(JSON.stringify([name, id])).toString('base64url');
}

export interface DecodePeopleListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodePeopleListCursor` could not have produced. */
export function decodePeopleListCursor({
  cursor,
}: DecodePeopleListCursorInput): PeopleListCursorPosition | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const [name, id] = parsed;
    if (typeof name !== 'string' || typeof id !== 'string' || !id) {
      return undefined;
    }
    return { name, id };
  } catch {
    return undefined;
  }
}
