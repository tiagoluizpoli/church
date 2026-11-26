import type { Instant } from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  SectorId,
} from '@/domain/branded-ids';
import { Assignment } from '@/domain/entities/assignment';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';

/** Scheduling entities for pure tests; the ids they do not care about are fixed. */

const churchId = 'church' as ChurchId;
const participationId = 'participation' as MinistryParticipationId;
const eventTimeBlockId = 'block' as EventTimeBlockId;

export interface TestShiftInput {
  id: string;
  startTime: Instant;
  endTime: Instant;
}

export function testShift({ id, startTime, endTime }: TestShiftInput): Shift {
  return new Shift({
    id,
    props: { churchId, participationId, eventTimeBlockId, startTime, endTime },
  });
}

export interface TestRequirementInput {
  id: string;
  shiftId: string;
  roleId: RoleId;
  peopleNeeded?: number;
}

export function testRequirement({
  id,
  shiftId,
  roleId,
  peopleNeeded = 1,
}: TestRequirementInput): ShiftRequirement {
  return new ShiftRequirement({
    id,
    props: {
      churchId,
      participationId,
      eventTimeBlockId,
      shiftId,
      roleId,
      sectorId: 'sector' as SectorId,
      sectorName: 'Sector',
      peopleNeeded,
    },
  });
}

export interface TestAssignmentInput {
  volunteerId: string;
  shiftId: string;
  shiftRequirementId: string;
  roleId?: RoleId;
}

export function testAssignment({
  volunteerId,
  shiftId,
  shiftRequirementId,
  roleId = 'role' as RoleId,
}: TestAssignmentInput): Assignment {
  return new Assignment({
    id: `${volunteerId}@${shiftRequirementId}`,
    props: {
      churchId,
      participationId,
      eventTimeBlockId,
      shiftId,
      volunteerId,
      roleId,
      shiftRequirementId,
      status: 'pending',
    },
  });
}
