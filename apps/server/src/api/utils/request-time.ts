import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  toDate,
  toInstant,
} from '@church/time';

export interface InstantStringInput {
  value: string;
}

/** A request body's ISO instant string, bridged to the `Date` legacy manager
 * contracts still expect. */
export function dateFromInstantString({ value }: InstantStringInput): Date {
  return toDate({ instant: parseInstant({ value }) });
}

export interface OptionalInstantStringInput {
  value: string | undefined;
}

/** {@link dateFromInstantString}, for an optional PATCH-body field. */
export function optionalDateFromInstantString({
  value,
}: OptionalInstantStringInput): Date | undefined {
  return value ? dateFromInstantString({ value }) : undefined;
}

export interface CalendarDayStringInput {
  value: string;
}

/** A request body's `yyyy-MM-dd` string, as the `Date` at its UTC midnight. */
export function dateFromCalendarDayString({
  value,
}: CalendarDayStringInput): Date {
  return toDate({
    instant: toInstant({
      day: parseCalendarDay({ value }),
      time: parseTimeOfDay({ value: '00:00' }),
      timeZone: 'UTC',
    }),
  });
}
