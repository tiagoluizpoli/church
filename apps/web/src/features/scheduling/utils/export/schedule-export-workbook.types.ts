import type { Locale } from '@church/time';
import type { GetScheduleExportData200 } from '@/infrastructure/api/churchAPI.schemas';

/** A workbook column, in the order #1108 fixes. */
export type WorkbookColumn =
  | 'date'
  | 'weekday'
  | 'event'
  | 'time'
  | 'sector'
  | 'role'
  | 'volunteer';

/** How a row reads: a spot, a cancelled Event or block, an empty spot. */
export type WorkbookRowTone = 'spot' | 'cancelled' | 'empty';

/** One row of a sheet's flat list; empty text is an empty cell. */
export interface WorkbookRow {
  /** The Event's start CalendarDay, `YYYY-MM-DD`. */
  day: string;
  weekday: string;
  event: string;
  time: string;
  /** The spot's Sector; null on a cancelled row. */
  sector: { name: string; paletteIndex: number } | null;
  role: string;
  volunteer: string;
  tone: WorkbookRowTone;
}

/** One sheet: its name, the header lines above the list, the list. */
export interface WorkbookSheet {
  name: string;
  /** Title, date range and, when it applies, the draft/single line. */
  header: string[];
  columns: WorkbookColumn[];
  rows: WorkbookRow[];
}

export interface WorkbookSheetsInput {
  data: GetScheduleExportData200;
  locale: Locale;
}

export interface WorkbookSheetsOutput {
  sheets: WorkbookSheet[];
}
