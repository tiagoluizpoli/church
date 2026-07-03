import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryParticipationId,
  TimeSlotId,
} from '../../../src/domain/branded-ids';
import { Shift } from '../../../src/domain/entities/shift';
import {
  InvalidTimeRangeError,
  ShiftOutOfBoundsError,
} from '../../../src/domain/errors';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const participationId =
  '55555555-5555-4555-8555-555555555555' as MinistryParticipationId;
const timeSlotId = '66666666-6666-4666-8666-666666666666' as TimeSlotId;

const slotBounds = {
  startTime: new Date('2026-08-02T09:00:00.000Z'),
  endTime: new Date('2026-08-02T12:00:00.000Z'),
};

interface BuildShiftInput {
  startTime: Date;
  endTime: Date;
  label?: string;
}

function buildShift({ startTime, endTime, label }: BuildShiftInput): Shift {
  return new Shift({
    props: {
      churchId,
      participationId,
      timeSlotId,
      startTime,
      endTime,
      label,
    },
    slotBounds,
  });
}

describe('Shift entity (DL1-SH)', () => {
  it('DL1-SH-01 constructs a shift within slot bounds', () => {
    const shift = buildShift({
      startTime: new Date('2026-08-02T09:30:00.000Z'),
      endTime: new Date('2026-08-02T11:00:00.000Z'),
      label: 'First serve',
    });

    expect(shift.churchId).toBe(churchId);
    expect(shift.participationId).toBe(participationId);
    expect(shift.timeSlotId).toBe(timeSlotId);
    expect(shift.label).toBe('First serve');
  });

  it('DL1-SH-02 accepts a shift equal to the whole slot', () => {
    const shift = buildShift({
      startTime: slotBounds.startTime,
      endTime: slotBounds.endTime,
    });

    expect(shift.startTime).toEqual(slotBounds.startTime);
    expect(shift.endTime).toEqual(slotBounds.endTime);
  });

  it('DL1-SH-03 rejects a shift starting before the slot', () => {
    expect(() =>
      buildShift({
        startTime: new Date('2026-08-02T08:59:00.000Z'),
        endTime: new Date('2026-08-02T10:00:00.000Z'),
      }),
    ).toThrow(ShiftOutOfBoundsError);
  });

  it('DL1-SH-04 rejects a shift ending after the slot', () => {
    expect(() =>
      buildShift({
        startTime: new Date('2026-08-02T10:00:00.000Z'),
        endTime: new Date('2026-08-02T12:01:00.000Z'),
      }),
    ).toThrow(ShiftOutOfBoundsError);
  });

  it('DL1-SH-05 rejects a shift with start >= end', () => {
    expect(() =>
      buildShift({
        startTime: new Date('2026-08-02T10:00:00.000Z'),
        endTime: new Date('2026-08-02T10:00:00.000Z'),
      }),
    ).toThrow(InvalidTimeRangeError);

    expect(() =>
      buildShift({
        startTime: new Date('2026-08-02T11:00:00.000Z'),
        endTime: new Date('2026-08-02T10:00:00.000Z'),
      }),
    ).toThrow(InvalidTimeRangeError);
  });

  it('DL1-SH-06 allows shifts touching slot start and end exactly', () => {
    const opening = buildShift({
      startTime: slotBounds.startTime,
      endTime: new Date('2026-08-02T10:00:00.000Z'),
    });
    const closing = buildShift({
      startTime: new Date('2026-08-02T11:00:00.000Z'),
      endTime: slotBounds.endTime,
    });

    expect(opening.startTime).toEqual(slotBounds.startTime);
    expect(closing.endTime).toEqual(slotBounds.endTime);
  });

  it('reconstructs a persisted shift without slot bounds re-validation', () => {
    const shift = new Shift({
      props: {
        churchId,
        participationId,
        timeSlotId,
        startTime: new Date('2026-08-02T09:30:00.000Z'),
        endTime: new Date('2026-08-02T11:00:00.000Z'),
      },
      id: '77777777-7777-4777-8777-777777777777',
    });

    expect(shift.id).toBe('77777777-7777-4777-8777-777777777777');
  });
});
