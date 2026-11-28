import type { Locale } from '@church/time';
import type {
  GetScheduleExportData200,
  GetScheduleExportData200PartsItem,
  GetScheduleExportData200PartsItemGroupsItemEventsItem,
  GetScheduleExportData200PartsItemGroupsItemEventsItemTimeBlocksItemShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';

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

export type ExportPart = GetScheduleExportData200PartsItem;

export type ExportEvent = GetScheduleExportData200PartsItemGroupsItemEventsItem;

export type ExportShift =
  GetScheduleExportData200PartsItemGroupsItemEventsItemTimeBlocksItemShiftsItem;

/** write-excel-file's browser file content. */
export type WorkbookContent = File | Blob | ArrayBuffer;

export interface ColumnLabelInput {
  column: WorkbookColumn;
}

export interface DayInput {
  day: string;
  locale: Locale;
}

export interface ShiftTimeInput {
  shift: ExportShift;
  locale: Locale;
}

export interface EventTitleInput {
  title: string;
  label: string | null;
}

export interface CancelledRowInput {
  title: string;
  /** "Não haverá culto" or "Cancelado", where the volunteer would be. */
  volunteer: string;
}

export interface EventRowsInput {
  event: ExportEvent;
  locale: Locale;
}

export interface SingleLineInput {
  part: ExportPart;
  locale: Locale;
}

export interface SheetNamesInput {
  names: string[];
}

export interface CellTextInput {
  row: WorkbookRow;
  column: WorkbookColumn;
}

export interface SheetLayoutInput {
  sheet: WorkbookSheet;
}

export interface DataRowInput {
  row: WorkbookRow;
  columns: WorkbookColumn[];
}

export interface FiltersInput {
  sheets: WorkbookSheet[];
}
