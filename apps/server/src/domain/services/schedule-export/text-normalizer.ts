import type { NormalizeSearchInput } from '@/domain/contracts/application/schedule-export-reader';

/** The text without accents ("Conceição" reads "Conceicao"). */
export function stripAccents({ value }: NormalizeSearchInput): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * The text as the export compares it: without accents, lowercase, runs of
 * spaces as one and no edge spaces, so search and name clashes ignore all four.
 */
export function normalizeSearch({ value }: NormalizeSearchInput): string {
  return stripAccents({ value })
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
