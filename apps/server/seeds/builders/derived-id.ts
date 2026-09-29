import { createHash } from 'node:crypto';

export interface DeriveSeedIdInput {
  /** The kind of row, so equal parents never collide across tables. */
  kind: string;
  /** The identifiers that make the row unique, e.g. its two parents. */
  parentIds: string[];
}

/**
 * A stable UUID for a row a blueprint does not name, such as an association
 * between two pinned records: the same parents always yield the same id, so a
 * reseed reproduces the whole graph without listing every join row.
 */
export function deriveSeedId({ kind, parentIds }: DeriveSeedIdInput): string {
  const hex = createHash('sha256')
    .update([kind, ...parentIds].join('\u0000'))
    .digest('hex');

  // Shaped as an RFC 9562 version-8 (custom) UUID.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
