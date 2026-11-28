import type { Locale } from '@church/i18n/runtime';
import type {
  ScheduleExportData,
  ScheduleExportPart,
} from '@/domain/contracts/application/schedule-export-reader';

export interface ScheduleExportTextInput {
  data: ScheduleExportData;
  locale: Locale;
}

/** `print`: A4 landscape pages (the PDF); `image`: one page as tall as the grid (the PNG). */
export type ScheduleExportMedia = 'print' | 'image';

export interface ScheduleExportRenderPayloadInput
  extends ScheduleExportTextInput {
  media: ScheduleExportMedia;
}

export interface ScheduleExportPartNameInput {
  part: ScheduleExportPart;
  locale: Locale;
}

/** A part's own header lines. */
export interface ScheduleExportPartText {
  /** Null for the one part of an unsplit export. */
  name: string | null;
  /** The part's single Role and/or Sector line, when there is one. */
  single: string | null;
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
  /** Each part's header lines, in the parts' order. */
  parts: ScheduleExportPartText[];
  draft: string;
  noService: string;
  cancelled: string;
  emptySpot: string;
  /** The catch-all Event group's default name. */
  catchAll: string;
  columns: ScheduleExportColumnsText;
}

/**
 * What a Typst template reads: the data untouched, the fixed text, and the
 * data's days and `HH:mm` times as they read in the locale.
 */
export interface ScheduleExportRenderPayload {
  media: ScheduleExportMedia;
  data: ScheduleExportData;
  text: ScheduleExportText;
  days: Record<string, string>;
  times: Record<string, string>;
}

export interface ScheduleExportFileNameInput extends ScheduleExportTextInput {
  /** The image's one part, named after it unless it is the whole export. */
  part?: ScheduleExportPart;
}

export interface AttachmentDispositionInput {
  name: string;
}
