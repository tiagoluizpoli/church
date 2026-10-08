/**
 * Dates for specs that create their own PlanningCycle through the product.
 * Each derives from the journey's anchor (a Church-local `yyyy-MM-dd`), so a
 * spec never reads the wall clock or a fixed calendar date. Journeys own
 * their Church, so cycle windows cannot overlap another journey's.
 */

const MS_PER_DAY = 86_400_000;

export interface AnchorInput {
  anchor: string;
}

export interface PlanningMonthWindow {
  /** First day of the month after the anchor's. */
  startDate: string;
  /** First day of the month after `startDate`'s. */
  endDate: string;
}

export interface DayInput {
  day: string;
}

interface DateInput {
  date: Date;
}

function toDay({ date }: DateInput): string {
  return date.toISOString().slice(0, 10);
}

function fromDay({ day }: DayInput): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The whole calendar month after the anchor's. */
export function planningMonth({ anchor }: AnchorInput): PlanningMonthWindow {
  const base = fromDay({ day: anchor });
  const start = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1),
  );
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  return { startDate: toDay({ date: start }), endDate: toDay({ date: end }) };
}

/** The day itself, or the Monday after when it is a Sunday. */
export function nonSundayDay({ day }: DayInput): string {
  const date = fromDay({ day });
  return toDay({
    date: date.getUTCDay() === 0 ? new Date(date.getTime() + MS_PER_DAY) : date,
  });
}

export interface DayOfMonthInput {
  /** `yyyy-MM-dd`; only its year and month are used. */
  monthStart: string;
  dayOfMonth: number;
}

/** A day of the month `monthStart` falls in. */
export function dayOfMonth({
  monthStart,
  dayOfMonth: day,
}: DayOfMonthInput): string {
  const base = fromDay({ day: monthStart });
  return toDay({
    date: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day)),
  });
}
