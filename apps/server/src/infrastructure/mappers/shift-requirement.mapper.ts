import type { shiftRequirement } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
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

type ShiftRequirementRow = InferSelectModel<typeof shiftRequirement>;

export interface MapShiftRequirementInput {
  row: ShiftRequirementRow;
  eventTimeBlockId?: string;
  /** The joined Sector's name, when the read joins it. */
  sectorName?: string;
}

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
    teamId: row.teamId
      ? (row.teamId as ShiftRequirementProps['teamId'])
      : undefined,
    sectorId: row.sectorId ? (row.sectorId as SectorId) : undefined,
    sectorName,
    peopleNeeded: row.peopleNeeded,
    notes: row.notes ?? undefined,
  };

  return new ShiftRequirement(props, row.id as ShiftRequirementId);
}
