import type { CalendarDay, Locale } from '@church/time';
import type { ChurchId, CycleId, MinistryId } from '../../branded-ids';
import type { IScheduleChangeReader } from './schedule-change-reader';
import type {
  EventGroupRepository,
  EventGroupSetup,
} from '@/domain/contracts/infrastructure/event-group.repository';
import type {
  ScheduleExportRepository,
  ScheduleExportRow,
} from '@/domain/contracts/infrastructure/schedule-export.repository';
import type { TypstRenderer } from '@/domain/contracts/infrastructure/typst-renderer';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface ReadScheduleExportInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  /** Inclusive Church-local days inside the Cycle; an open side is the Cycle's own. */
  from?: CalendarDay;
  to?: CalendarDay;
}

export interface ListScheduleExportCyclesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** Words each found in the name, a date or a month covered, ignoring case and accents. */
  q?: string;
  locale: Locale;
}

/** A Cycle the Ministry has a Schedule in, for the export's Cycle picker. */
export interface ScheduleExportCycleOption {
  id: string;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  /** The Church's today falls inside it. */
  isCurrent: boolean;
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

/**
 * How a group of Events reads: `list` is the one plain list of a Ministry
 * without Event groups, `group` a named Event group, `catchAll` every Event
 * no group holds.
 */
export type ScheduleExportGroupKind = 'list' | 'group' | 'catchAll';

export interface ScheduleExportGroup {
  kind: ScheduleExportGroupKind;
  /** Null for the plain list, and for a catch-all keeping its default name. */
  name: string | null;
  events: ScheduleExportEvent[];
}

export interface ScheduleExportPart {
  /** Null for the one part of an unsplit export. */
  name: string | null;
  singleSector: string | null;
  singleRole: string | null;
  /** In the Ministry's order, the catch-all last; never an empty group. */
  groups: ScheduleExportGroup[];
}

export interface ScheduleExportMinistry {
  name: string;
}

export interface ScheduleExportCycle {
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/** The inclusive days exported: the Cycle's span unless narrowed. */
export interface ScheduleExportRange {
  from: CalendarDay;
  to: CalendarDay;
}

/**
 * The export's ordered tree of facts (parts → Events → time blocks → Shifts
 * → Sectors → people). Never ready-made text: every output localizes it.
 */
export interface ScheduleExportData {
  ministry: ScheduleExportMinistry;
  cycle: ScheduleExportCycle;
  range: ScheduleExportRange;
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

export interface NormalizeSearchInput {
  value: string;
}

export interface MonthNamesInput {
  locale: Locale;
}

export interface DuplicateNamesInput {
  rows: ScheduleExportRow[];
}

export interface EventTemplateIdsInput {
  rows: ScheduleExportRow[];
}

export interface GroupScheduleExportEventsInput {
  events: ScheduleExportEvent[];
  /** Each Event's EventTemplate, in the Events' order. */
  templateIds: (string | null)[];
  setup: EventGroupSetup;
}

export interface DbScheduleExportReaderDependencies {
  scheduleExportRepository: ScheduleExportRepository;
  eventGroupRepository: EventGroupRepository;
  scheduleChangeReader: IScheduleChangeReader;
  unitOfWork: UnitOfWork;
  typstRenderer: TypstRenderer;
}

export interface RenderScheduleExportFileInput {
  exported: ScheduleExport;
  /** The data with its fixed text, localized by the caller. */
  payload: unknown;
  format: 'pdf';
}

export interface IScheduleExportReader {
  /** The Cycles the Ministry has a Schedule in, newest first. */
  listCycles(
    input: ListScheduleExportCyclesInput,
  ): Promise<ScheduleExportCycleOption[]>;
  /**
   * Throws `ExportScheduleNotFoundError` when the Ministry has no Schedule in
   * the Cycle, `InvalidDateRangeError` when `from` is after `to` and
   * `ExportRangeOutsideCycleError` when either reaches past the Cycle.
   */
  read(input: ReadScheduleExportInput): Promise<ScheduleExport>;
  /** The Grid template's file; throws `TypstRenderError` when it fails. */
  renderFile(input: RenderScheduleExportFileInput): Promise<Uint8Array>;
}
