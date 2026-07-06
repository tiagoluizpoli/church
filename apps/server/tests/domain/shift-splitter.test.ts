import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryParticipationId,
  TimeSlotId,
} from '../../src/domain/branded-ids';
import type { Shift } from '../../src/domain/entities/shift';
import {
  InvalidShiftSplitError,
  ShiftOutOfBoundsError,
} from '../../src/domain/errors';
import {
  type ShiftSplitStrategy,
  ShiftSplitter,
} from '../../src/domain/services/shift-splitter';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const participationId =
  '55555555-5555-4555-8555-555555555555' as MinistryParticipationId;

const timeSlot = {
  id: '66666666-6666-4666-8666-666666666666' as TimeSlotId,
  startTime: new Date('2026-08-02T09:00:00.000Z'),
  endTime: new Date('2026-08-02T12:00:00.000Z'),
};

const splitter = new ShiftSplitter();

function split(strategy: ShiftSplitStrategy): Shift[] {
  return splitter.split({
    churchId,
    participationId,
    timeSlot,
    strategy,
  });
}

interface AssertExactTilingInput {
  shifts: Shift[];
}

function assertExactTiling({ shifts }: AssertExactTilingInput): void {
  expect(shifts[0]?.startTime).toEqual(timeSlot.startTime);
  expect(shifts[shifts.length - 1]?.endTime).toEqual(timeSlot.endTime);

  for (let index = 1; index < shifts.length; index += 1) {
    expect(shifts[index]?.startTime).toEqual(shifts[index - 1]?.endTime);
  }
}

describe('ShiftSplitter (DL1-SS)', () => {
  it('DL1-SS-01 splits equally into N shifts covering the slot exactly', () => {
    const shifts = split({ kind: 'equal-n', n: 3 });

    expect(shifts).toHaveLength(3);
    assertExactTiling({ shifts });

    const spanMs = shifts.map(
      (shift) => shift.endTime.getTime() - shift.startTime.getTime(),
    );
    expect(spanMs).toEqual([3_600_000, 3_600_000, 3_600_000]);
  });

  it('DL1-SS-02 N=1 yields a single shift equal to the whole slot', () => {
    const shifts = split({ kind: 'equal-n', n: 1 });

    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.startTime).toEqual(timeSlot.startTime);
    expect(shifts[0]?.endTime).toEqual(timeSlot.endTime);
  });

  it('DL1-SS-03 final shift absorbs the remainder when span is not divisible (CL-014)', () => {
    // 3h = 10_800_000 ms over 7 shifts → base 1_542_857 ms, remainder 1 ms
    const shifts = split({ kind: 'equal-n', n: 7 });

    expect(shifts).toHaveLength(7);
    assertExactTiling({ shifts });

    const baseSpan =
      (shifts[0]?.endTime.getTime() ?? 0) -
      (shifts[0]?.startTime.getTime() ?? 0);
    const finalSpan =
      (shifts[6]?.endTime.getTime() ?? 0) -
      (shifts[6]?.startTime.getTime() ?? 0);

    expect(baseSpan).toBe(Math.floor(10_800_000 / 7));
    expect(finalSpan).toBe(10_800_000 - baseSpan * 6);
    expect(finalSpan).toBeGreaterThanOrEqual(baseSpan);
  });

  it('DL1-SS-04 rejects N = 0 and negative N', () => {
    expect(() => split({ kind: 'equal-n', n: 0 })).toThrow(
      InvalidShiftSplitError,
    );
    expect(() => split({ kind: 'equal-n', n: -2 })).toThrow(
      InvalidShiftSplitError,
    );
  });

  it('rejects a split count too high for the slot duration', () => {
    const shortSlot = {
      id: timeSlot.id,
      startTime: new Date('2026-08-02T09:00:00.000Z'),
      endTime: new Date('2026-08-02T09:00:00.001Z'),
    };

    expect(() =>
      splitter.split({
        churchId,
        participationId,
        timeSlot: shortSlot,
        strategy: { kind: 'equal-n', n: 2 },
      }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('DL1-SS-05 accepts manual unequal spans within bounds', () => {
    const shifts = split({
      kind: 'manual',
      spans: [
        {
          startTime: new Date('2026-08-02T09:00:00.000Z'),
          endTime: new Date('2026-08-02T09:30:00.000Z'),
          label: 'Setup',
        },
        {
          startTime: new Date('2026-08-02T09:30:00.000Z'),
          endTime: new Date('2026-08-02T12:00:00.000Z'),
          label: 'Service',
        },
      ],
    });

    expect(shifts).toHaveLength(2);
    expect(shifts[0]?.label).toBe('Setup');
    expect(shifts[1]?.label).toBe('Service');
  });

  it('DL1-SS-06 rejects the whole split when any manual span is out of bounds', () => {
    expect(() =>
      split({
        kind: 'manual',
        spans: [
          {
            startTime: new Date('2026-08-02T09:00:00.000Z'),
            endTime: new Date('2026-08-02T10:00:00.000Z'),
          },
          {
            startTime: new Date('2026-08-02T11:00:00.000Z'),
            endTime: new Date('2026-08-02T12:30:00.000Z'),
          },
        ],
      }),
    ).toThrow(ShiftOutOfBoundsError);
  });

  it('DL1-SS-07 allows manual gaps but rejects overlapping spans (CL-014)', () => {
    const gapped = split({
      kind: 'manual',
      spans: [
        {
          startTime: new Date('2026-08-02T09:00:00.000Z'),
          endTime: new Date('2026-08-02T10:00:00.000Z'),
        },
        {
          startTime: new Date('2026-08-02T11:00:00.000Z'),
          endTime: new Date('2026-08-02T12:00:00.000Z'),
        },
      ],
    });

    expect(gapped).toHaveLength(2);

    expect(() =>
      split({
        kind: 'manual',
        spans: [
          {
            startTime: new Date('2026-08-02T09:00:00.000Z'),
            endTime: new Date('2026-08-02T10:30:00.000Z'),
          },
          {
            startTime: new Date('2026-08-02T10:00:00.000Z'),
            endTime: new Date('2026-08-02T12:00:00.000Z'),
          },
        ],
      }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('rejects an empty manual span list', () => {
    expect(() => split({ kind: 'manual', spans: [] })).toThrow(
      InvalidShiftSplitError,
    );
  });
});
