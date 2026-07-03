import type { shift } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryParticipationId,
  ShiftId,
  TimeSlotId,
} from '../../domain/branded-ids';
import type { ShiftProps } from '../../domain/entities/shift';
import { Shift } from '../../domain/entities/shift';

type ShiftRow = InferSelectModel<typeof shift>;

export function mapShift(row: ShiftRow): Shift {
  const props: ShiftProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    timeSlotId: row.timeSlotId as TimeSlotId,
    startTime: row.startTime,
    endTime: row.endTime,
    label: row.label ?? undefined,
  };

  return new Shift({
    props,
    id: row.id as ShiftId,
    createdAt: row.createdAt,
  });
}
