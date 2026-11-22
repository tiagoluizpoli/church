import type { MonthlyRecurrenceEntry, Recurrence, Weekday } from './recurrence';

type Ordinal = 1 | 2 | 3 | 4 | 5 | 'last';

/** Weekday activities sort before day-of-month ones; the last day of the month closes the month. */
const LAST_DAY_POSITION = 32;
const ORDINAL_ORDER: readonly Ordinal[] = [1, 2, 3, 4, 5, 'last'];

interface PlacementInput {
  recurrence: Recurrence;
}

interface Placement {
  group: 0 | 1;
  position: number;
}

/** Where a Recurrence sits in the Programme: weekday group (0) or day-of-month group (1), then the weekday or day. */
function placement({ recurrence }: PlacementInput): Placement {
  if (recurrence.kind === 'weekly') {
    return { group: 0, position: Math.min(...recurrence.weekdays) };
  }
  const [first] = recurrence.entries;
  if (first?.kind === 'nthWeekday') {
    return { group: 0, position: first.weekday };
  }
  return {
    group: 1,
    position: first?.kind === 'dayOfMonth' ? first.day : LAST_DAY_POSITION,
  };
}

interface SortableActivity {
  recurrence: Recurrence;
  startTime: string;
}

export interface CompareRegularActivitiesInput {
  left: SortableActivity;
  right: SortableActivity;
}

/** The Programme order: weekday activities (Sunday onward, then time, weekly before monthly), then day-of-month ones (by day, then time). A mixed Recurrence is placed by its first entry. */
export function compareRegularActivities({
  left,
  right,
}: CompareRegularActivitiesInput): number {
  const a = placement({ recurrence: left.recurrence });
  const b = placement({ recurrence: right.recurrence });
  const weeklyFirst =
    Number(left.recurrence.kind === 'monthly') -
    Number(right.recurrence.kind === 'monthly');
  return (
    a.group - b.group ||
    a.position - b.position ||
    (left.startTime < right.startTime
      ? -1
      : left.startTime > right.startTime
        ? 1
        : 0) ||
    weeklyFirst
  );
}

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
