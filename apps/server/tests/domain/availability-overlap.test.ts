import { describe, expect, it } from 'vitest';
import type { MinistryId, ShiftId } from '../../src/domain/branded-ids';
import type { OverlapCandidateShift } from '../../src/domain/services/availability-overlap';
import { detectCrossMinistryOverlaps } from '../../src/domain/services/availability-overlap';

const ministryA = '11111111-1111-4111-8111-111111111111' as MinistryId;
const ministryB = '22222222-2222-4222-8222-222222222222' as MinistryId;

interface BuildShiftInput {
  id: string;
  ministryId: MinistryId;
  start: string;
  end: string;
}

function buildShift({
  id,
  ministryId,
  start,
  end,
}: BuildShiftInput): OverlapCandidateShift {
  return {
    shiftId: id as ShiftId,
    ministryId,
    startTime: new Date(start),
    endTime: new Date(end),
  };
}

describe('detectCrossMinistryOverlaps (DL1-OV)', () => {
  it('DL1-OV-01 two shifts on the same date with intersecting times overlap', () => {
    const first = buildShift({
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      ministryId: ministryA,
      start: '2026-08-02T09:00:00.000Z',
      end: '2026-08-02T12:00:00.000Z',
    });
    const second = buildShift({
      id: 'bbbbbbbb-2222-4222-8222-222222222222',
      ministryId: ministryB,
      start: '2026-08-02T11:00:00.000Z',
      end: '2026-08-02T14:00:00.000Z',
    });

    const overlaps = detectCrossMinistryOverlaps({ shifts: [first, second] });

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.first.shiftId).toBe(first.shiftId);
    expect(overlaps[0]?.second.shiftId).toBe(second.shiftId);
  });

  it('DL1-OV-02 adjacent shifts (touching edges) do not overlap', () => {
    const overlaps = detectCrossMinistryOverlaps({
      shifts: [
        buildShift({
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          ministryId: ministryA,
          start: '2026-08-02T09:00:00.000Z',
          end: '2026-08-02T12:00:00.000Z',
        }),
        buildShift({
          id: 'bbbbbbbb-2222-4222-8222-222222222222',
          ministryId: ministryB,
          start: '2026-08-02T12:00:00.000Z',
          end: '2026-08-02T15:00:00.000Z',
        }),
      ],
    });

    expect(overlaps).toEqual([]);
  });

  it('DL1-OV-03 compares absolute timestamps: midnight-crossing shift overlaps; same clock-time on different dates does not', () => {
    // Midnight-crossing shift (Sat 23:00 → Sun 02:00) vs Sun 01:00 → 03:00: overlap.
    const crossing = detectCrossMinistryOverlaps({
      shifts: [
        buildShift({
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          ministryId: ministryA,
          start: '2026-08-01T23:00:00.000Z',
          end: '2026-08-02T02:00:00.000Z',
        }),
        buildShift({
          id: 'bbbbbbbb-2222-4222-8222-222222222222',
          ministryId: ministryB,
          start: '2026-08-02T01:00:00.000Z',
          end: '2026-08-02T03:00:00.000Z',
        }),
      ],
    });
    expect(crossing).toHaveLength(1);

    // Same clock time, one week apart: no overlap.
    const differentDates = detectCrossMinistryOverlaps({
      shifts: [
        buildShift({
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          ministryId: ministryA,
          start: '2026-08-02T09:00:00.000Z',
          end: '2026-08-02T12:00:00.000Z',
        }),
        buildShift({
          id: 'bbbbbbbb-2222-4222-8222-222222222222',
          ministryId: ministryB,
          start: '2026-08-09T09:00:00.000Z',
          end: '2026-08-09T12:00:00.000Z',
        }),
      ],
    });
    expect(differentDates).toEqual([]);
  });

  it('DL1-OV-04 same-ministry intersections are not flagged (cross-ministry only)', () => {
    const overlaps = detectCrossMinistryOverlaps({
      shifts: [
        buildShift({
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          ministryId: ministryA,
          start: '2026-08-02T09:00:00.000Z',
          end: '2026-08-02T12:00:00.000Z',
        }),
        buildShift({
          id: 'bbbbbbbb-2222-4222-8222-222222222222',
          ministryId: ministryA,
          start: '2026-08-02T10:00:00.000Z',
          end: '2026-08-02T13:00:00.000Z',
        }),
      ],
    });

    expect(overlaps).toEqual([]);
  });
});
