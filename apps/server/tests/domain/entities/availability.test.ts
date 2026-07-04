import { describe, expect, it } from 'vitest';
import type {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { Availability } from '../../../src/domain/entities/availability';
import { InvalidTimeRangeError } from '../../../src/domain/errors/invalid-time-range';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const availabilityCheckId =
  '22222222-2222-4222-8222-222222222222' as AvailabilityCheckId;
const shiftId = '33333333-3333-4333-8333-333333333333' as ShiftId;
const volunteerId = '44444444-4444-4444-8444-444444444444' as VolunteerId;

describe('Availability entity — unavailability mark (DL1-AV)', () => {
  it('DL1-AV-01 mark is keyed to availabilityCheckId + shiftId', () => {
    const mark = new Availability({
      props: {
        churchId,
        availabilityCheckId,
        shiftId,
        volunteerId,
        shiftStartTime: new Date('2026-08-02T09:00:00.000Z'),
        shiftEndTime: new Date('2026-08-02T12:00:00.000Z'),
      },
    });

    expect(mark.availabilityCheckId).toBe(availabilityCheckId);
    expect(mark.shiftId).toBe(shiftId);
    expect(mark.volunteerId).toBe(volunteerId);
    expect(mark.churchId).toBe(churchId);
  });

  it('rejects an inverted shift time range', () => {
    expect(
      () =>
        new Availability({
          props: {
            churchId,
            availabilityCheckId,
            shiftId,
            volunteerId,
            shiftStartTime: new Date('2026-08-02T12:00:00.000Z'),
            shiftEndTime: new Date('2026-08-02T09:00:00.000Z'),
          },
        }),
    ).toThrow(InvalidTimeRangeError);
  });
});
