import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  SectorId,
  ShiftId,
} from '../../domain/branded-ids';
import type {
  ShiftRequirementId,
  ShiftRequirementProps,
} from '../../domain/entities/shift-requirement';
import { ShiftRequirement } from '../../domain/entities/shift-requirement';
import type { MapShiftRequirementInput } from './shift-requirement.mapper.types';

export function mapShiftRequirement({
  row,
  eventTimeBlockId,
  sectorName,
}: MapShiftRequirementInput): ShiftRequirement {
  const props: ShiftRequirementProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    shiftId: row.shiftId as ShiftId,
    eventTimeBlockId: (eventTimeBlockId ?? row.shiftId) as EventTimeBlockId,
    roleId: row.roleId as RoleId,
    sectorId: row.sectorId as SectorId,
    sectorName,
    peopleNeeded: row.peopleNeeded,
    notes: row.notes ?? undefined,
  };

  return new ShiftRequirement({ props, id: row.id as ShiftRequirementId });
}
