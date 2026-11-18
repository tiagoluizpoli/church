import { describe, expect, it } from 'vitest';
import { decodeListCursor, encodeListCursor } from '@/domain/list-cursor';

describe('list cursor codec', () => {
  it('round-trips the fields of the list that issued it', () => {
    const cursor = encodeListCursor({
      owner: 'people',
      fields: ['Ana Souza', '0b6f6c4e-6a43-4a43-9c55-0d8f6b0e2a11'],
    });

    expect(cursor).toMatch(/^[\w-]+$/);
    expect(decodeListCursor({ owner: 'people', cursor, size: 2 })).toEqual([
      'Ana Souza',
      '0b6f6c4e-6a43-4a43-9c55-0d8f6b0e2a11',
    ]);
  });

  it('keeps separators, unicode and empty strings intact', () => {
    const fields = ['Louvor | Música', '', 'São João ✝', '|'];
    const cursor = encodeListCursor({ owner: 'schedules', fields });

    expect(decodeListCursor({ owner: 'schedules', cursor, size: 4 })).toEqual(
      fields,
    );
  });

  it('rejects a cursor issued by another list', () => {
    const cursor = encodeListCursor({
      owner: 'ministries',
      fields: ['Louvor', '0b6f6c4e-6a43-4a43-9c55-0d8f6b0e2a11'],
    });

    expect(
      decodeListCursor({ owner: 'people', cursor, size: 2 }),
    ).toBeUndefined();
    expect(
      decodeListCursor({ owner: 'schedules', cursor, size: 2 }),
    ).toBeUndefined();
  });

  it.each([
    ['garbage', 'garbage'],
    ['not base64 JSON', Buffer.from('ministries|a|b').toString('base64url')],
    ['a JSON object', Buffer.from('{"a":1}').toString('base64url')],
    [
      'a non-string field',
      Buffer.from('["people","Ana",7]').toString('base64url'),
    ],
    ['too few fields', Buffer.from('["people","Ana"]').toString('base64url')],
    [
      'too many fields',
      Buffer.from('["people","Ana","x","y"]').toString('base64url'),
    ],
    ['an empty string', ''],
  ])('rejects %s', (_label, cursor) => {
    expect(
      decodeListCursor({ owner: 'people', cursor, size: 2 }),
    ).toBeUndefined();
  });

  it('rejects a cursor whose bytes were tampered with', () => {
    const cursor = encodeListCursor({ owner: 'people', fields: ['Ana', 'x'] });

    expect(
      decodeListCursor({ owner: 'people', cursor: `${cursor}%`, size: 2 }),
    ).toBeUndefined();
    expect(
      decodeListCursor({
        owner: 'people',
        cursor: cursor.slice(0, -3),
        size: 2,
      }),
    ).toBeUndefined();
  });
});
