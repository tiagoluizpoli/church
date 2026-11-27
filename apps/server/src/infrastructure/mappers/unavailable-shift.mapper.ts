import { fromDate } from '@church/time';
import type {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { UnavailableShiftProps } from '../../domain/entities/unavailable-shift';
import { UnavailableShift } from '../../domain/entities/unavailable-shift';
import type { MapUnavailableShiftInput } from './unavailable-shift.mapper.types';

export function mapUnavailableShift({
  row,
  joined,
}: MapUnavailableShiftInput): UnavailableShift {
  const props: UnavailableShiftProps = {
    churchId: row.churchId as ChurchId,
    availabilityCheckId: row.availabilityCheckId as AvailabilityCheckId,
    shiftId: row.shiftId as ShiftId,
    volunteerId: joined.volunteerId as VolunteerId,
    shiftStartTime: fromDate({ date: joined.shiftStartTime }),
    shiftEndTime: fromDate({ date: joined.shiftEndTime }),
  };

  return new UnavailableShift({
    props,
    id: row.id,
    createdAt: row.createdAt,
  });
}
