import { fromDate } from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  ShiftId,
} from '../../domain/branded-ids';
import type { ShiftProps } from '../../domain/entities/shift';
import { Shift } from '../../domain/entities/shift';
import type { ShiftRow } from './shift.mapper.types';

export function mapShift(row: ShiftRow): Shift {
  const props: ShiftProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    eventTimeBlockId: row.eventTimeBlockId as EventTimeBlockId,
    startTime: fromDate({ date: row.startTime }),
    endTime: fromDate({ date: row.endTime }),
    label: row.label ?? undefined,
  };

  return new Shift({
    props,
    id: row.id as ShiftId,
    createdAt: row.createdAt,
  });
}
