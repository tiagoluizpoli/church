export interface ZonedMomentInput {
  timeZone: string;
  epochMs: number;
}

/** Zero-padded wall-clock fields of a moment in a zone. */
export interface WallClockFields {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

// Building an Intl.DateTimeFormat is costly; one per zone serves every read.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function wallClockFields({
  timeZone,
  epochMs,
}: ZonedMomentInput): WallClockFields {
  const fields: WallClockFields = {
    year: '',
    month: '',
    day: '',
    hour: '',
    minute: '',
    second: '',
  };
  for (const { type, value } of formatterFor(timeZone).formatToParts(epochMs)) {
    if (type in fields) fields[type as keyof WallClockFields] = value;
  }
  fields.year = fields.year.padStart(4, '0');
  return fields;
}

/** The zone's UTC offset at a moment, in ms, east positive: the wall clock
 * read as if it were UTC, minus the moment. */
export function zoneOffsetMs({ timeZone, epochMs }: ZonedMomentInput): number {
  const { year, month, day, hour, minute, second } = wallClockFields({
    timeZone,
    epochMs,
  });
  const wallClock = new Date(
    Date.UTC(2000, 0, 1, Number(hour), Number(minute), Number(second)),
  );
  // Date.UTC reads years 0–99 as 1900–1999; setUTCFullYear takes any year.
  wallClock.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  // The wall clock has whole seconds, so compare against the moment's second.
  return wallClock.getTime() - Math.floor(epochMs / 1000) * 1000;
}
