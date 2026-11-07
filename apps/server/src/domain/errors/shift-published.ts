import { DomainError } from '@church/core';
import type { ShiftId } from '../branded-ids';

interface ShiftPublishedErrorInput {
  shiftIds: ShiftId[];
}

export class ShiftPublishedError extends DomainError {
  readonly code = 'SHIFT_PUBLISHED' as const;
  readonly shiftIds: ShiftId[];

  constructor({ shiftIds }: ShiftPublishedErrorInput) {
    super('Published Shifts cannot be marked unavailable');
    this.shiftIds = shiftIds;
  }
}
