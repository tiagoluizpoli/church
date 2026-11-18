/** The keyset-paged lists; the tag keeps one list's cursor from reaching another. */
export type CursorList = 'ministries' | 'people' | 'invitations' | 'schedules';

const BASE64URL = /^[\w-]+$/;

export interface EncodeListCursorInput {
  owner: CursorList;
  fields: readonly string[];
}

/** Opaque, URL-safe position made of the list's ordering fields. */
export function encodeListCursor({
  owner,
  fields,
}: EncodeListCursorInput): string {
  return Buffer.from(JSON.stringify([owner, ...fields])).toString('base64url');
}

export interface DecodeListCursorInput {
  owner: CursorList;
  cursor: string;
  /** How many fields the list encodes. */
  size: number;
}

/** The fields, or undefined for anything `encodeListCursor` could not have produced for `owner`. */
export function decodeListCursor({
  owner,
  cursor,
  size,
}: DecodeListCursorInput): string[] | undefined {
  if (!BASE64URL.test(cursor)) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (!Array.isArray(parsed) || parsed.length !== size + 1) return undefined;
    const [tag, ...fields] = parsed;
    if (tag !== owner || fields.some((field) => typeof field !== 'string')) {
      return undefined;
    }
    return fields;
  } catch {
    return undefined;
  }
}
