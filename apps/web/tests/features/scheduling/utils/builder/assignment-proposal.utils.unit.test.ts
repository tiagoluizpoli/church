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
    const ordinals = scheduleOrdinals({
      data,
      additions: [pick('s2'), pick('s0')],
    });
    expect(ordinals.get('s0-b:v1')).toBe(1);
    expect(ordinals.get('s2-b:v1')).toBe(3);
  });
});
