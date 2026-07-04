import { describe, expect, it } from 'vitest';
import type { ShiftId } from '../../src/domain/branded-ids';
import { CrossMinistryScopeError } from '../../src/domain/errors/cross-ministry-scope';
import {
  assertMarksWithinScope,
  expandWholeDayShiftIds,
  resolveShiftAvailability,
} from '../../src/domain/services/availability-marks';

const shiftA = '11111111-1111-4111-8111-111111111111' as ShiftId;
const shiftB = '22222222-2222-4222-8222-222222222222' as ShiftId;
const shiftC = '33333333-3333-4333-8333-333333333333' as ShiftId;

const TIME_ZONE = 'America/Sao_Paulo';

describe('resolveShiftAvailability (DL1-AC-04, DL1-AV-01, DL1-AV-03)', () => {
  it('DL1-AC-04 zero marks ⇒ every shift resolves available (available-by-default)', () => {
    const resolved = resolveShiftAvailability({
      shiftIds: [shiftA, shiftB, shiftC],
      markedShiftIds: [],
    });

    expect(resolved).toEqual([
      { shiftId: shiftA, available: true },
      { shiftId: shiftB, available: true },
      { shiftId: shiftC, available: true },
    ]);
  });

  it('DL1-AV-01 existence of a mark ⇒ unavailable for that shift only', () => {
    const resolved = resolveShiftAvailability({
      shiftIds: [shiftA, shiftB],
      markedShiftIds: [shiftB],
    });

    expect(resolved).toEqual([
      { shiftId: shiftA, available: true },
      { shiftId: shiftB, available: false },
    ]);
  });

  it('DL1-AV-03 removing a mark restores default-available', () => {
    const before = resolveShiftAvailability({
      shiftIds: [shiftA],
      markedShiftIds: [shiftA],
    });
    const after = resolveShiftAvailability({
      shiftIds: [shiftA],
      markedShiftIds: [],
    });

    expect(before).toEqual([{ shiftId: shiftA, available: false }]);
    expect(after).toEqual([{ shiftId: shiftA, available: true }]);
  });
});

describe('expandWholeDayShiftIds (DL1-AV-02)', () => {
  it('DL1-AV-02 expands to one mark per shift on the church-local date', () => {
    // 2026-08-02 23:30 UTC is already 2026-08-02 20:30 in São Paulo (UTC-3);
    // 2026-08-03 01:00 UTC is still 2026-08-02 22:00 locally.
    const shiftIds = expandWholeDayShiftIds({
      churchDate: '2026-08-02',
      timeZone: TIME_ZONE,
      shifts: [
        {
          shiftId: shiftA,
          startTime: new Date('2026-08-02T12:00:00.000Z'),
          endTime: new Date('2026-08-02T15:00:00.000Z'),
        },
        {
          shiftId: shiftB,
          startTime: new Date('2026-08-03T01:00:00.000Z'),
          endTime: new Date('2026-08-03T03:00:00.000Z'),
        },
        {
          shiftId: shiftC,
          startTime: new Date('2026-08-03T12:00:00.000Z'),
          endTime: new Date('2026-08-03T15:00:00.000Z'),
        },
      ],
    });

    expect(shiftIds).toEqual([shiftA, shiftB]);
  });

  it('returns empty when no shift starts on the date', () => {
    const shiftIds = expandWholeDayShiftIds({
      churchDate: '2026-08-09',
      timeZone: TIME_ZONE,
      shifts: [
        {
          shiftId: shiftA,
          startTime: new Date('2026-08-02T12:00:00.000Z'),
          endTime: new Date('2026-08-02T15:00:00.000Z'),
        },
      ],
    });

    expect(shiftIds).toEqual([]);
  });
});

describe('assertMarksWithinScope (DL1-AV-04)', () => {
  it('DL1-AV-04 rejects a mark for a shift outside the check cycle/membership scope', () => {
    expect(() =>
      assertMarksWithinScope({
        candidateShiftIds: [shiftA, shiftB],
        requestedShiftIds: [shiftA, shiftC],
      }),
    ).toThrow(CrossMinistryScopeError);
  });

  it('accepts marks fully inside the candidate scope', () => {
    expect(() =>
      assertMarksWithinScope({
        candidateShiftIds: [shiftA, shiftB],
        requestedShiftIds: [shiftB],
      }),
    ).not.toThrow();
  });
});
