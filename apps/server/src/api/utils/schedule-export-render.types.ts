import type { Locale } from '@church/i18n/runtime';
import type { ScheduleExportData } from '@/domain/contracts/application/schedule-export-reader';

export interface ScheduleExportTextInput {
  data: ScheduleExportData;
  locale: Locale;
}

export interface ScheduleExportColumnsText {
  date: string;
  event: string;
  time: string;
  sector: string;
  people: string;
}

/** Fixed text in the request locale; the template never writes its own. */
export interface ScheduleExportText {
  kicker: string;
  range: string;
  /** The whole-export single Role and/or Sector line, when there is one. */
  single: string | null;
  draft: string;
  noService: string;
  cancelled: string;
  emptySpot: string;
  columns: ScheduleExportColumnsText;
}

/**
 * What a Typst template reads: the data untouched, the fixed text, and the
 * data's days and `HH:mm` times as they read in the locale.
 */
export interface ScheduleExportRenderPayload {
  data: ScheduleExportData;
  text: ScheduleExportText;
  days: Record<string, string>;
  times: Record<string, string>;
}

export interface AttachmentDispositionInput {
  name: string;
}
