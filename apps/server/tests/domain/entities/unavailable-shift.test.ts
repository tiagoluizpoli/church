import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '@/domain/branded-ids';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { InvalidTimeRangeError } from '@/domain/errors/invalid-time-range';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const availabilityCheckId =
  '22222222-2222-4222-8222-222222222222' as AvailabilityCheckId;
const shiftId = '33333333-3333-4333-8333-333333333333' as ShiftId;
const volunteerId = '44444444-4444-4444-8444-444444444444' as VolunteerId;

describe('UnavailableShift entity — unavailable shift (DL1-AV)', () => {
  it('DL1-AV-01 unavailable shift is keyed to availabilityCheckId + shiftId', () => {
    const unavailableShift = new UnavailableShift({
      props: {
        churchId,
        availabilityCheckId,
        shiftId,
        volunteerId,
        shiftStartTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
        shiftEndTime: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
      },
    });

    expect(unavailableShift.availabilityCheckId).toBe(availabilityCheckId);
    expect(unavailableShift.shiftId).toBe(shiftId);
    expect(unavailableShift.volunteerId).toBe(volunteerId);
    expect(unavailableShift.churchId).toBe(churchId);
  });

  it('rejects an inverted shift time range', () => {
    expect(
      () =>
        new UnavailableShift({
          props: {
            churchId,
            availabilityCheckId,
            shiftId,
            volunteerId,
            shiftStartTime: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
            shiftEndTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
          },
        }),
    ).toThrow(InvalidTimeRangeError);
  });
});
