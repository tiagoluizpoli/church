/**
 * How a Schedule export words its facts, the same on the server (images and
 * PDF) and in the browser (Excel). Localized words come in as inputs, so the
 * rule stays free of i18n.
 */

export interface ExportPartWeek {
  /** `YYYY-MM-DD`. */
  from: string;
  to: string;
}

export interface ExportPartFacts {
  kind: string;
  name: string | null;
  week: ExportPartWeek | null;
}

export interface ExportPartWording {
  /** A week part's name, such as "Semana 02–08 mar". */
  week: (week: ExportPartWeek) => string;
  /** The catch-all Event group's default name, such as "Outros". */
  catchAll: () => string;
}

export interface ExportPartNameInput {
  part: ExportPartFacts;
  wording: ExportPartWording;
}

/**
 * A split part's name: the group, Sector or Role as written, the week, the
 * catch-all's default name; null for the one part of an unsplit export.
 */
export function exportPartName({
  part,
  wording,
}: ExportPartNameInput): string | null {
  if (part.kind === 'all') return null;
  if (part.week) return wording.week(part.week);
  if (part.kind === 'catchAll' && part.name === null) return wording.catchAll();
  return part.name;
}

export interface ExportTimeInput {
  /** `HH:mm`. */
  time: string;
}

export interface ExportTimeParts {
  hours: string;
  minutes: string;
}

/** An `HH:mm` time's parts, as the `export_time` message words them ("10h30"). */
export function exportTimeParts({ time }: ExportTimeInput): ExportTimeParts {
  const [hours = '', minutes = ''] = time.split(':');
  return { hours, minutes };
}

export interface ExportDayRangeInput {
  /** `YYYY-MM-DD`. */
  from: string;
  to: string;
}

/** `01/12/2026 – 31/12/2026`: an inclusive span of two days. */
export function exportDayRange({ from, to }: ExportDayRangeInput): string {
  const day = (value: string) =>
    value.slice(0, 10).split('-').reverse().join('/');
  return `${day(from)} – ${day(to)}`;
}
