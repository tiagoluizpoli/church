import { DomainError } from '@church/core';
import type { CalendarDay } from '@church/time';
import type { CycleId } from '../branded-ids';
import type { Cycle } from '../entities/cycle';

/** A Cycle of the Active Church whose inclusive range a write collides with. */
export interface ConflictingCycleReference {
  id: CycleId;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
}

export interface OverlappingCycleErrorInput {
  conflictingCycles: Cycle[];
}

export class OverlappingCycleError extends DomainError {
  readonly code = 'OVERLAPPING_CYCLE' as const;
  readonly conflictingCycles: ConflictingCycleReference[];

  constructor({ conflictingCycles }: OverlappingCycleErrorInput) {
    super('Cycle overlaps an existing cycle');
    this.conflictingCycles = conflictingCycles.map((conflict) => ({
      id: conflict.id,
      name: conflict.name,
      startDate: conflict.startDate,
      endDate: conflict.endDate,
    }));
  }
}
