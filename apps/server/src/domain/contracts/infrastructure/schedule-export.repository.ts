import type { CalendarDay } from '@church/time';
import type { ChurchId, CycleId, MinistryId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface ScheduleExportScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

/** The rows of the Events whose Church-local start day is in `from`..`to`. */
export interface ScheduleExportRowsInput extends ScheduleExportScopeInput {
  from: CalendarDay;
  to: CalendarDay;
  timeZone: string;
}

export interface ScheduleExportCyclesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** Normalized words (lowercase, no accents); every one must match. */
  words: string[];
  /** The 12 month names to search, January first, normalized like the words. */
  monthNames: string[];
  now: Date;
}

/** The Schedule a Ministry has in a Cycle, with what its export header shows. */
export interface ScheduleExportFacts {
  ministryName: string;
  cycleName: string;
  cycleStartDate: CalendarDay;
  cycleEndDate: CalendarDay;
  timeZone: string;
  logoKey: string | null;
  /** Some Participation of the Schedule was published. */
  published: boolean;
  /** Latest change of its Events and Participations. */
  changedAt: Date;
}

/**
 * One served, shown EventTimeBlock joined down to one Assignment. Columns
 * from a missing Shift, ShiftRequirement or Assignment are null.
 */
export interface ScheduleExportRow {
  eventId: string;
  eventTitle: string;
  eventStart: Date;
  eventEnd: Date;
  eventCancelled: boolean;
  blockId: string;
  blockLabel: string | null;
  blockCancelled: boolean;
  shiftId: string | null;
  shiftLabel: string | null;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  requirementId: string | null;
  sectorId: string | null;
  sectorName: string | null;
  roleName: string | null;
  peopleNeeded: number | null;
  volunteerId: string | null;
  volunteerName: string | null;
}

export interface ScheduleExportCycleRow {
  id: string;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  isCurrent: boolean;
}

/** The read-only export read of one Ministry's Schedule in one Cycle (#1243). */
export interface ScheduleExportRepository {
  /** Null when the Ministry has no Schedule in the Cycle. */
  findSchedule(
    input: ScheduleExportScopeInput,
  ): Promise<ScheduleExportFacts | null>;
  /**
   * In a total order: Event start, block start, Shift start, then Sector,
   * Role and Volunteer name ignoring case, ids breaking ties.
   */
  listRows(input: ScheduleExportRowsInput): Promise<ScheduleExportRow[]>;
  /**
   * Cycles with an Event the Ministry takes part in, newest start first,
   * each word found in the name, a date (DD/MM/YYYY or ISO) or a month
   * covered (its name and year).
   */
  listCycles(
    input: ScheduleExportCyclesInput,
  ): Promise<ScheduleExportCycleRow[]>;
  /** Every Sector of the Ministry, alphabetical ignoring case. */
  listSectorIds(input: ScheduleExportScopeInput): Promise<string[]>;
}
