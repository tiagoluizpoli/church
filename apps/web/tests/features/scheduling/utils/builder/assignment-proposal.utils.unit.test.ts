import { describe, expect, it } from 'vitest';
import type {
  CycleBuilderData,
  CycleBuilderShiftSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';
import {
  coverageOf,
  scheduleOrdinals,
} from '@/features/scheduling/utils/builder/assignment-proposal.utils';

const reason = {
  eligibleShiftCount: 1,
  needCandidateCount: 2,
  decidedBy: 'fewest_eligible_shifts' as const,
};

interface ShiftInput {
  shiftId: string;
  startTime: string;
  volunteerIds: string[];
}

/** Two Sectors: `a` needs 1, `b` needs 2. Existing volunteers fill `a`. */
function shift({
  shiftId,
  startTime,
  volunteerIds,
}: ShiftInput): CycleBuilderShiftSummary {
  return {
    shiftId,
    eventTimeBlockId: 'block',
    startTime,
    endTime: startTime,
    peopleNeeded: 3,
    assignedCount: volunteerIds.length,
    requirements: [
      { id: `${shiftId}-a`, roleId: 'role', sectorName: 'A', peopleNeeded: 1 },
      { id: `${shiftId}-b`, roleId: 'role', sectorName: 'B', peopleNeeded: 2 },
    ],
    assignments: volunteerIds.map((volunteerId, index) => ({
      id: `${shiftId}-${index}`,
      churchId: 'church',
      eventTimeBlockId: 'block',
      participationId: 'participation',
      shiftId,
      volunteerId,
      roleId: 'role',
      shiftRequirementId: `${shiftId}-a`,
      status: 'confirmed',
      assignedAt: startTime,
      lateMark: false,
    })),
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
  };
}

describe('coverageOf', () => {
  it('caps each Sector, so overstaffing one never fills another', () => {
    const overstaffed = shift({
      shiftId: 's1',
      startTime: '2027-01-03T12:00:00.000Z',
      volunteerIds: ['v1', 'v2'],
    });
    const additions = [
      {
        volunteerId: 'v3',
        volunteerName: 'C',
        shiftRequirementId: 's1-a',
        shiftId: 's1',
        reason,
      },
      {
        volunteerId: 'v4',
        volunteerName: 'D',
        shiftRequirementId: 's1-b',
        shiftId: 's1',
        reason,
      },
    ];
    expect(coverageOf({ shifts: [overstaffed], additions })).toEqual({
      required: 3,
      before: 1,
      after: 2,
    });
  });
});

describe('scheduleOrdinals', () => {
  it("places each pick in its volunteer's Schedule by start time", () => {
    const first = shift({
      shiftId: 's1',
      startTime: '2027-01-03T12:00:00.000Z',
      volunteerIds: ['v1'],
    });
    const later = shift({
      shiftId: 's2',
      startTime: '2027-01-10T12:00:00.000Z',
      volunteerIds: [],
    });
    const earlier = shift({
      shiftId: 's0',
      startTime: '2027-01-01T12:00:00.000Z',
      volunteerIds: [],
    });
    const data = {
      assignments: [],
      roles: [],
      events: [
        {
          eventTimeBlocks: [
            { included: true, shifts: [earlier, first, later] },
          ],
        },
      ],
    } as unknown as CycleBuilderData;
    const pick = (shiftId: string) => ({
      volunteerId: 'v1',
      volunteerName: 'A',
      shiftRequirementId: `${shiftId}-b`,
      shiftId,
      reason,
    });
    const { ordinals, heavyLoad } = scheduleOrdinals({
      data,
      additions: [pick('s2'), pick('s0')],
    });
    expect(ordinals.get('s0-b:v1')).toBe(1);
    expect(ordinals.get('s2-b:v1')).toBe(3);
    // One volunteer at 3 (the median): past half again of it, from the 5th.
    expect(heavyLoad).toBe(5);
  });
});

describe('scheduleOrdinals heavy load', () => {
  it('tags past half again the median load, strongly from twice it', () => {
    const shifts = Array.from({ length: 12 }, (_, index) =>
      shift({
        shiftId: `s${index}`,
        startTime: `2027-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        volunteerIds: [],
      }),
    );
    const data = {
      assignments: [],
      roles: [],
      events: [{ eventTimeBlocks: [{ included: true, shifts }] }],
    } as unknown as CycleBuilderData;
    // v1 serves 10 times, v2 and v3 serve 5 (the median): v1 from the 8th.
    const additions = [
      ...shifts.slice(0, 10).map(({ shiftId }) => ['v1', shiftId]),
      ...shifts.slice(0, 5).map(({ shiftId }) => ['v2', shiftId]),
      ...shifts.slice(5, 10).map(({ shiftId }) => ['v3', shiftId]),
    ].map(([volunteerId, shiftId]) => ({
      volunteerId,
      volunteerName: volunteerId,
      shiftRequirementId: `${shiftId}-b`,
      shiftId,
      reason,
    }));
    const load = scheduleOrdinals({ data, additions });
    expect(load.heavyLoad).toBe(8);
    expect(load.severeLoad).toBe(10);
    expect(load.totals.get('v1')).toBe(10);
  });
});

describe('scheduleOrdinals on a month of Sundays', () => {
  it('flags only the clear outlier, not the people who serve both services', () => {
    const shifts = Array.from({ length: 14 }, (_, index) =>
      shift({
        shiftId: `s${index}`,
        startTime: `2027-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        volunteerIds: [],
      }),
    );
    const data = {
      assignments: [],
      roles: [],
      events: [{ eventTimeBlocks: [{ included: true, shifts }] }],
    } as unknown as CycleBuilderData;
    // As in the Janeiro 2027 seed: twenty-two one-off helpers, thirteen
    // people at 6, nine at 8 (both Sunday services), one at 14.
    const loads: [string, number][] = [
      ...Array.from({ length: 22 }, (_, i): [string, number] => [
        `once-${i}`,
        1,
      ]),
      ...Array.from({ length: 13 }, (_, i): [string, number] => [
        `six-${i}`,
        6,
      ]),
      ...Array.from({ length: 9 }, (_, i): [string, number] => [
        `eight-${i}`,
        8,
      ]),
      ['outlier', 14],
    ];
    const additions = loads.flatMap(([volunteerId, count]) =>
      shifts.slice(0, count).map(({ shiftId }) => ({
        volunteerId,
        volunteerName: volunteerId,
        shiftRequirementId: `${shiftId}-b`,
        shiftId,
        reason,
      })),
    );
    const { ordinals, heavyLoad, severeLoad } = scheduleOrdinals({
      data,
      additions,
    });

    expect(heavyLoad).toBe(10);
    expect(severeLoad).toBe(12);
    const flagged = [...ordinals]
      .filter(([, ordinal]) => ordinal >= heavyLoad)
      .map(([key]) => key.split(':')[1]);
    expect(new Set(flagged)).toEqual(new Set(['outlier']));
    expect(flagged).toHaveLength(5);
  });
});
