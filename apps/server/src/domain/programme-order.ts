import type { MonthlyRecurrenceEntry, Recurrence, Weekday } from './recurrence';

type Ordinal = 1 | 2 | 3 | 4 | 5 | 'last';

const ORDINAL_ORDER: readonly Ordinal[] = [1, 2, 3, 4, 5, 'last'];

export interface ExceptOrdinalsInput {
  recurrence: Recurrence;
  /** Recurrences of the templates that won over this activity's template. */
  winners: Recurrence[];
}

/** The nth weekdays on which a weekly activity loses to a winner on one of its weekdays ("Todo domingo, exceto o 1º"). Day-of-month winners leave it plain. */
export function exceptOrdinals({
  recurrence,
  winners,
}: ExceptOrdinalsInput): Ordinal[] {
  if (recurrence.kind !== 'weekly') return [];
  const weekdays: Weekday[] = recurrence.weekdays;
  const found = new Set<Ordinal>();
  for (const winner of winners) {
    if (winner.kind !== 'monthly') continue;
    for (const entry of winner.entries as MonthlyRecurrenceEntry[]) {
      if (entry.kind === 'nthWeekday' && weekdays.includes(entry.weekday)) {
        found.add(entry.ordinal);
      }
    }
  }
  return ORDINAL_ORDER.filter((ordinal) => found.has(ordinal));
}
