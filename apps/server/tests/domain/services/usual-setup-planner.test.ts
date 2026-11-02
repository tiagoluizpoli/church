import { parseInstant, parseTimeOfDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import type { RoleId, SectorId } from '@/domain/branded-ids';
import {
  planUsualSetupShifts,
  splitFitsBlock,
  templateBlockBounds,
} from '@/domain/services/usual-setup-planner';

const sectorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as SectorId;
const sectorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as SectorId;
const roleX = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as RoleId;
const timeZone = 'America/Sao_Paulo';

const t = (value: string) => parseTimeOfDay({ value });
const span = (startTime: string, endTime: string) => ({
  startTime: t(startTime),
  endTime: t(endTime),
});
// 22:00 → 06:00 Sao Paulo (UTC-3): an overnight Event copy, whatever the template says now.
const overnight = {
  startTime: parseInstant({ value: '2027-05-01T01:00:00.000Z' }),
  endTime: parseInstant({ value: '2027-05-01T09:00:00.000Z' }),
};

describe('usual setup planner', () => {
  it('keeps a valid overnight manual split, resolved in the Church Timezone', () => {
    const plan = planUsualSetupShifts({
      shiftSplit: {
        kind: 'manual',
        spans: [span('22:00', '00:00'), span('00:00', '06:00')],
      },
      headcounts: [
        { shiftIndex: 1, sectorId: sectorA, roleId: roleX, peopleNeeded: 2 },
      ],
      block: overnight,
      timeZone,
    });

    expect(plan.fallback).toBe(false);
    expect(plan.shifts.map((s) => [s.startTime, s.endTime])).toEqual([
      ['2027-05-01T01:00:00.000Z', '2027-05-01T03:00:00.000Z'],
      ['2027-05-01T03:00:00.000Z', '2027-05-01T09:00:00.000Z'],
    ]);
    expect(plan.shifts[1]?.headcounts).toHaveLength(1);
  });

  it('judges the split by the copied bounds, not the current template', () => {
    // Fits a 22:00–06:00 template but the frozen copy ended at 03:00.
    const shortCopy = {
      ...overnight,
      endTime: parseInstant({ value: '2027-05-01T06:00:00.000Z' }),
    };
    const shiftSplit = {
      kind: 'manual' as const,
      spans: [span('22:00', '05:00')],
    };

    expect(splitFitsBlock({ shiftSplit, block: overnight, timeZone })).toBe(
      true,
    );
    expect(splitFitsBlock({ shiftSplit, block: shortCopy, timeZone })).toBe(
      false,
    );
  });

  it('falls back to one whole-block Shift with counts summed per Sector × Role', () => {
    const plan = planUsualSetupShifts({
      shiftSplit: {
        kind: 'manual',
        spans: [span('21:00', '23:00'), span('23:00', '03:00')],
      },
      headcounts: [
        { shiftIndex: 0, sectorId: sectorB, roleId: roleX, peopleNeeded: 1 },
        { shiftIndex: 0, sectorId: sectorA, roleId: roleX, peopleNeeded: 2 },
        { shiftIndex: 1, sectorId: sectorA, roleId: roleX, peopleNeeded: 3 },
      ],
      block: overnight,
      timeZone,
    });

    expect(plan.fallback).toBe(true);
    expect(plan.shifts).toHaveLength(1);
    expect(plan.shifts[0]).toMatchObject({
      startTime: overnight.startTime,
      endTime: overnight.endTime,
    });
    expect(plan.shifts[0]?.headcounts).toEqual([
      { shiftIndex: 0, sectorId: sectorA, roleId: roleX, peopleNeeded: 5 },
      { shiftIndex: 0, sectorId: sectorB, roleId: roleX, peopleNeeded: 1 },
    ]);
  });

  it('rejects overlapping and zero-length spans', () => {
    const block = templateBlockBounds({
      startTime: t('09:00'),
      endTime: t('12:00'),
    });
    const fits = (spans: ReturnType<typeof span>[]) =>
      splitFitsBlock({ shiftSplit: { kind: 'manual', spans }, ...block });

    expect(fits([span('09:00', '10:30'), span('10:00', '12:00')])).toBe(false);
    expect(fits([span('10:00', '10:00')])).toBe(false);
    expect(fits([span('09:00', '10:00'), span('11:00', '12:00')])).toBe(true);
  });
});
