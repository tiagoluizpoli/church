import { DomainError } from '@church/core';
import type { RoleId, SectorId, ShiftId } from '../branded-ids';

/** A ShiftRequirement whose desired headcount drops below its active Assignments. */
export interface HeadcountFloor {
  shiftId: ShiftId;
  sectorId: SectorId;
  roleId: RoleId;
  assignedCount: number;
}

export interface HeadcountBelowAssignedErrorInput {
  headcountFloors: HeadcountFloor[];
}

export class HeadcountBelowAssignedError extends DomainError {
  readonly code = 'HEADCOUNT_BELOW_ASSIGNED' as const;
  readonly headcountFloors: HeadcountFloor[];

  constructor({ headcountFloors }: HeadcountBelowAssignedErrorInput) {
    super('A headcount cannot drop below its active Assignments');
    this.headcountFloors = headcountFloors;
  }
}
