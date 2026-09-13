// Internal to the package: not re-exported from `index.ts`.

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface UtcMidnightInput {
  day: string;
}

/** The `Date` at UTC midnight of a `yyyy-MM-dd` label. CalendarDay math runs on
 * the UTC calendar, which has no DST; an impossible day yields an invalid or
 * rolled-over `Date`, so validate before trusting it. */
export function utcMidnightOf({ day }: UtcMidnightInput): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
