export interface PluralMessageInput {
  count: number;
  one: () => string;
  other: () => string;
}

/** Picks the `_one` or `_other` catalog message for `count`. */
export function pluralMessage({ count, one, other }: PluralMessageInput) {
  return count === 1 ? one() : other();
}
