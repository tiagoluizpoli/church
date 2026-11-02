import { parseTimeOfDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  SectorId,
  TemplateTimeBlockId,
} from '@/domain/branded-ids';
import {
  toSaveableUsualSetupEntry,
  UsualSetup,
  type UsualSetupEntryInput,
  type UsualSetupProps,
} from '@/domain/entities/usual-setup';
import { DuplicateHeadcountError } from '@/domain/errors/duplicate-headcount';
import { InvalidRequiredCountError } from '@/domain/errors/invalid-required-count';
import { InvalidShiftIndexError } from '@/domain/errors/invalid-shift-index';
import { InvalidShiftSplitError } from '@/domain/errors/invalid-shift-split';
import { UsualSetupEmptyError } from '@/domain/errors/usual-setup-empty';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '22222222-2222-4222-8222-222222222222' as MinistryId;
const sourceTemplateTimeBlockId =
  '33333333-3333-4333-8333-333333333333' as TemplateTimeBlockId;
const roleId = '44444444-4444-4444-8444-444444444444' as RoleId;
const sectorId = '99999999-9999-4999-8999-999999999999' as SectorId;

interface BuildProfileInput {
  props?: Partial<UsualSetupProps>;
}

function buildProfile({ props }: BuildProfileInput = {}): UsualSetup {
  return new UsualSetup({
    props: {
      churchId,
      ministryId,
      sourceTemplateTimeBlockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [{ shiftIndex: 0, sectorId, roleId, peopleNeeded: 1 }],
      ...props,
    },
  });
}

describe('UsualSetup entity', () => {
  it('constructs with a valid equal split and exposes its properties', () => {
    const profile = buildProfile();

    expect(profile.churchId).toBe(churchId);
    expect(profile.ministryId).toBe(ministryId);
    expect(profile.sourceTemplateTimeBlockId).toBe(sourceTemplateTimeBlockId);
    expect(profile.serves).toBe(true);
    expect(profile.shiftSplit).toEqual({ kind: 'equal', count: 2 });
    expect(profile.headcounts).toEqual([
      { shiftIndex: 0, sectorId, roleId, peopleNeeded: 1 },
    ]);
  });

  it('constructs with a valid manual split', () => {
    const profile = buildProfile({
      props: {
        shiftSplit: {
          kind: 'manual',
          spans: [
            {
              startTime: parseTimeOfDay({ value: '09:00' }),
              endTime: parseTimeOfDay({ value: '10:00' }),
            },
          ],
        },
      },
    });

    expect(profile.shiftSplit.kind).toBe('manual');
  });

  it('rejects a non-integer equal split count', () => {
    expect(() =>
      buildProfile({ props: { shiftSplit: { kind: 'equal', count: 1.5 } } }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('rejects an equal split count less than 1', () => {
    expect(() =>
      buildProfile({ props: { shiftSplit: { kind: 'equal', count: 0 } } }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('rejects manual spans whose start does not precede the end', () => {
    expect(() =>
      buildProfile({
        props: {
          shiftSplit: {
            kind: 'manual',
            spans: [
              {
                startTime: parseTimeOfDay({ value: '10:00' }),
                endTime: parseTimeOfDay({ value: '10:00' }),
              },
            ],
          },
        },
      }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('rejects a headcount with a non-integer count', () => {
    expect(() =>
      buildProfile({
        props: {
          headcounts: [{ shiftIndex: 0, sectorId, roleId, peopleNeeded: 1.5 }],
        },
      }),
    ).toThrow(InvalidRequiredCountError);
  });

  it('rejects a headcount with count less than 1', () => {
    expect(() =>
      buildProfile({
        props: {
          headcounts: [{ shiftIndex: 0, sectorId, roleId, peopleNeeded: 0 }],
        },
      }),
    ).toThrow(InvalidRequiredCountError);
  });

  it('keeps the same Sector and Role distinct in different Shifts, and refuses a repeat in one Shift', () => {
    const twoShifts = buildProfile({
      props: {
        headcounts: [
          { shiftIndex: 0, sectorId, roleId, peopleNeeded: 1 },
          { shiftIndex: 1, sectorId, roleId, peopleNeeded: 3 },
        ],
      },
    });

    expect(twoShifts.headcounts).toHaveLength(2);
    expect(() =>
      buildProfile({
        props: {
          headcounts: [
            { shiftIndex: 1, sectorId, roleId, peopleNeeded: 1 },
            { shiftIndex: 1, sectorId, roleId, peopleNeeded: 2 },
          ],
        },
      }),
    ).toThrow(DuplicateHeadcountError);
  });
});

describe('toSaveableUsualSetupEntry', () => {
  const serving: UsualSetupEntryInput = {
    sourceTemplateTimeBlockId,
    serves: true,
    shiftSplit: { kind: 'equal', count: 2 },
    headcounts: [{ shiftIndex: 1, sectorId, roleId, peopleNeeded: 2 }],
  };

  it('keeps a serving entry as given', () => {
    expect(toSaveableUsualSetupEntry({ entry: serving })).toEqual(serving);
  });

  it('refuses a serving entry without any positive headcount', () => {
    expect(() =>
      toSaveableUsualSetupEntry({ entry: { ...serving, headcounts: [] } }),
    ).toThrow(UsualSetupEmptyError);
  });

  it('refuses a headcount for a Shift the split does not generate', () => {
    for (const shiftIndex of [2, -1]) {
      expect(() =>
        toSaveableUsualSetupEntry({
          entry: {
            ...serving,
            headcounts: [{ shiftIndex, sectorId, roleId, peopleNeeded: 1 }],
          },
        }),
      ).toThrow(InvalidShiftIndexError);
    }
  });

  it('saves a non-serving entry in the canonical one-Shift, no-headcount form', () => {
    expect(
      toSaveableUsualSetupEntry({ entry: { ...serving, serves: false } }),
    ).toEqual({
      sourceTemplateTimeBlockId,
      serves: false,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    });
  });
});
