import { DomainError } from '@church/core';
import type { ShiftId } from '../branded-ids';

/** The answers and active Assignments a destructive edit would discard from one Shift. */
export interface ShiftResponseCount {
  shiftId: ShiftId;
  unavailableMarkCount: number;
  assignmentCount: number;
}

export interface ShiftHasResponsesErrorInput {
  shiftResponses: ShiftResponseCount[];
}

export class ShiftHasResponsesError extends DomainError {
  readonly code = 'SHIFT_HAS_RESPONSES' as const;
  readonly shiftResponses: ShiftResponseCount[];

  constructor({ shiftResponses }: ShiftHasResponsesErrorInput) {
    super('A Shift with answers or active Assignments cannot be discarded');
    this.shiftResponses = shiftResponses;
  }
}
