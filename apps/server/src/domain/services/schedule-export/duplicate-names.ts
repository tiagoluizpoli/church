import { normalizeSearch } from './text-normalizer';
import type { DuplicateNamesInput } from '@/domain/contracts/application/schedule-export-reader';

/** Names of different Volunteers that read the same ignoring case, accents and spaces. */
export function duplicateNames({ rows }: DuplicateNamesInput): string[][] {
  const namesByKey = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const { volunteerId, volunteerName } = row;
    if (!volunteerId || volunteerName === null) continue;
    if (row.eventCancelled || row.blockCancelled) continue;
    const key = normalizeSearch({ value: volunteerName });
    const volunteers = namesByKey.get(key) ?? new Map<string, string>();
    volunteers.set(volunteerId, volunteerName);
    namesByKey.set(key, volunteers);
  }
  return [...namesByKey.values()]
    .filter((volunteers) => volunteers.size > 1)
    .map((volunteers) => [...volunteers.values()].sort());
}
