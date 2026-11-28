import type { CalendarDay } from '@church/time';
import type { ChurchId, CycleId, MinistryId } from '../../branded-ids';
import type { IScheduleChangeReader } from './schedule-change-reader';
import type {
  ScheduleExportRepository,
  ScheduleExportRow,
} from '@/domain/contracts/infrastructure/schedule-export.repository';
import type {
  TypstFormat,
  TypstRenderer,
} from '@/domain/contracts/infrastructure/typst-renderer';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface ReadScheduleExportInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
}

/** A person serving, or an empty spot (`name: null`, drafts only). */
export interface ScheduleExportPerson {
  name: string | null;
  role: string;
}

export interface ScheduleExportSector {
  name: string;
  /** Alphabetical position of the Sector in its Ministry. */
  paletteIndex: number;
  people: ScheduleExportPerson[];
}

export interface ScheduleExportShift {
  label: string | null;
  /** The Shift's day, for a multi-day Event only. */
  day: CalendarDay | null;
  /** Church-local `HH:mm`. */
  startTime: string;
  endTime: string;
  sectors: ScheduleExportSector[];
}

export interface ScheduleExportTimeBlock {
  label: string | null;
  cancelled: boolean;
  shifts: ScheduleExportShift[];
}

export interface ScheduleExportEvent {
  startDay: CalendarDay;
  endDay: CalendarDay;
  title: string;
  cancelled: boolean;
  timeBlocks: ScheduleExportTimeBlock[];
}

export interface ScheduleExportPart {
  /** Null for the one part of an unsplit export. */
  name: string | null;
  singleSector: string | null;
  singleRole: string | null;
  events: ScheduleExportEvent[];
}

export interface ScheduleExportMinistry {
  name: string;
}

export interface ScheduleExportCycle {
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/**
 * The export's ordered tree of facts (parts → Events → time blocks → Shifts
 * → Sectors → people). Never ready-made text: every output localizes it.
 */
export interface ScheduleExportData {
  ministry: ScheduleExportMinistry;
  cycle: ScheduleExportCycle;
  /** No Event of the Schedule was ever published. */
  isDraft: boolean;
  hasUnsentChanges: boolean;
  singleSector: string | null;
  singleRole: string | null;
  /** Names of different Volunteers equal ignoring case, accents and spaces. */
  duplicateNames: string[][];
  parts: ScheduleExportPart[];
}

/** The data plus what the rendered file embeds. */
export interface ScheduleExport {
  data: ScheduleExportData;
  logoKey: string | null;
  changedAt: Date;
}

export interface BuildScheduleExportEventsInput {
  rows: ScheduleExportRow[];
  paletteIndexBySectorId: Map<string, number>;
  withEmptySpots: boolean;
  timeZone: string;
}

export interface SingleValueInput {
  values: string[];
}

export interface DuplicateNamesInput {
  rows: ScheduleExportRow[];
}

export interface DbScheduleExportReaderDependencies {
  scheduleExportRepository: ScheduleExportRepository;
  scheduleChangeReader: IScheduleChangeReader;
  unitOfWork: UnitOfWork;
  typstRenderer: TypstRenderer;
}

export interface RenderScheduleExportFileInput {
  exported: ScheduleExport;
  /** The data with its fixed text, localized by the caller. */
  payload: unknown;
  /** `svg` is one preview page of what the payload's media lays out. */
  format: TypstFormat;
  /** 1-based page of a PNG or SVG; an empty file past the last page. */
  page?: number;
}

export interface IScheduleExportReader {
  /** Throws `NotFoundError` when the Ministry has no Schedule in the Cycle. */
  read(input: ReadScheduleExportInput): Promise<ScheduleExport>;
  /** The Grid template's file or page; throws `TypstRenderError` when it fails. */
  renderFile(input: RenderScheduleExportFileInput): Promise<Uint8Array>;
}
