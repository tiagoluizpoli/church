import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  TimeBlockId,
} from '../../../src/domain/branded-ids';
import {
  MinistryServingProfile,
  type MinistryServingProfileProps,
} from '../../../src/domain/entities/ministry-serving-profile';
import { InvalidRequiredCountError } from '../../../src/domain/errors/invalid-required-count';
import { InvalidShiftSplitError } from '../../../src/domain/errors/invalid-shift-split';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '22222222-2222-4222-8222-222222222222' as MinistryId;
const sourceTemplateBlockId =
  '33333333-3333-4333-8333-333333333333' as TimeBlockId;
const roleId = '44444444-4444-4444-8444-444444444444' as RoleId;

interface BuildProfileInput {
  props?: Partial<MinistryServingProfileProps>;
}

function buildProfile({
  props,
}: BuildProfileInput = {}): MinistryServingProfile {
  return new MinistryServingProfile({
    props: {
      churchId,
      ministryId,
      sourceTemplateBlockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [{ roleId, count: 1 }],
      ...props,
    },
  });
}

describe('MinistryServingProfile entity', () => {
  it('constructs with a valid equal split and exposes its properties', () => {
    const profile = buildProfile();

    expect(profile.churchId).toBe(churchId);
    expect(profile.ministryId).toBe(ministryId);
    expect(profile.sourceTemplateBlockId).toBe(sourceTemplateBlockId);
    expect(profile.serves).toBe(true);
    expect(profile.shiftSplit).toEqual({ kind: 'equal', count: 2 });
    expect(profile.headcounts).toEqual([{ roleId, count: 1 }]);
  });

  it('constructs with a valid manual split', () => {
    const profile = buildProfile({
      props: {
        shiftSplit: {
          kind: 'manual',
          spans: [{ startTime: '09:00', endTime: '10:00' }],
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
            spans: [{ startTime: '10:00', endTime: '10:00' }],
          },
        },
      }),
    ).toThrow(InvalidShiftSplitError);
  });

  it('rejects a headcount with a non-integer count', () => {
    expect(() =>
      buildProfile({ props: { headcounts: [{ roleId, count: 1.5 }] } }),
    ).toThrow(InvalidRequiredCountError);
  });

  it('rejects a headcount with count less than 1', () => {
    expect(() =>
      buildProfile({ props: { headcounts: [{ roleId, count: 0 }] } }),
    ).toThrow(InvalidRequiredCountError);
  });
});
