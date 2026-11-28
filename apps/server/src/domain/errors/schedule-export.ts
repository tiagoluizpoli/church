import { DomainError } from '@church/core';
import type { CalendarDay } from '@church/time';

export interface ExportRangeOutsideCycleErrorInput {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/** An export's from/to reaches past its Cycle; the message shows the Cycle's span. */
export class ExportRangeOutsideCycleError extends DomainError {
  readonly code = 'EXPORT_RANGE_OUTSIDE_CYCLE' as const;
  readonly startDate: CalendarDay;
  readonly endDate: CalendarDay;

  constructor({ startDate, endDate }: ExportRangeOutsideCycleErrorInput) {
    super(`The export range must fall within ${startDate}–${endDate}`);
    this.startDate = startDate;
    this.endDate = endDate;
  }
}

/** The Ministry has no Schedule in the Cycle it would export. */
export class ExportScheduleNotFoundError extends DomainError {
  readonly code = 'EXPORT_SCHEDULE_NOT_FOUND' as const;

  constructor() {
    super('The Ministry has no Schedule in this Cycle');
  }
}
