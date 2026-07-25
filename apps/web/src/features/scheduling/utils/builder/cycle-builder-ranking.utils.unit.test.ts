import { describe, expect, it } from 'vitest';
import {
  countWorkload,
  rankVolunteersForShiftRole,
} from './cycle-builder-ranking.utils';
import type {
  CycleBuilderAssignment,
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderShiftSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    requiredCount: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeEligible(
  overrides: Partial<CycleBuilderEligibleVolunteerSummary> &
    Pick<CycleBuilderEligibleVolunteerSummary, 'volunteerId' | 'volunteerName'>,
): CycleBuilderEligibleVolunteerSummary {
  return {
    isAvailable: true,
    hasConflict: false,
    qualifiedRoleIds: ['role-1'],
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<CycleBuilderAssignment> &
    Pick<CycleBuilderAssignment, 'id' | 'volunteerId'>,
): CycleBuilderAssignment {
  return {
    churchId: 'church-1',
    slotId: 'slot-1',
    shiftId: 'shift-1',
    roleId: 'role-1',
    status: 'confirmed',
    assignedAt: '2027-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('rankVolunteersForShiftRole', () => {
  it('ranks availability, then longest since served, then cycle load, then name', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'conflicted',
          volunteerName: 'Ana',
          hasConflict: true,
        }),
        makeEligible({
          volunteerId: 'silent',
          volunteerName: 'Bruno',
          isAvailable: false,
        }),
        makeEligible({
          volunteerId: 'recent',
          volunteerName: 'Carla',
          lastServedAt: '2027-01-01T12:00:00.000Z',
        }),
        makeEligible({ volunteerId: 'never', volunteerName: 'Diego' }),
      ],
    });

    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [],
    });

    expect(ranking.ids).toEqual(['never', 'recent', 'silent', 'conflicted']);
    expect(ranking.idealVolunteerId).toBe('never');
  });

  it('breaks a tie on cycle workload before name', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'busy', volunteerName: 'Ana' }),
        makeEligible({ volunteerId: 'free', volunteerName: 'Bruno' }),
      ],
    });

    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'busy', shiftId: 'other' }),
      ],
    });

    expect(ranking.ids).toEqual(['free', 'busy']);
  });

  it('does not badge someone already serving elsewhere in the cycle as ideal', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'busy', volunteerName: 'Ana' }),
        makeEligible({ volunteerId: 'free', volunteerName: 'Bruno' }),
      ],
    });

    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [
        makeAssignment({
          id: 'a-1',
          volunteerId: 'busy',
          shiftId: 'other-shift',
        }),
      ],
    });

    // The picker's Recommended list drops people with another cycle
    // assignment, so the rail's badge must apply the same bar.
    expect(ranking.ids).toContain('busy');
    expect(ranking.idealVolunteerId).toBe('free');
  });

  it('drops people already serving the shift and ignores their cancelled rows', () => {
    const shift = makeShift({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'serving' }),
        makeAssignment({
          id: 'a-2',
          volunteerId: 'released',
          status: 'cancelled',
        }),
      ],
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'serving', volunteerName: 'Ana' }),
        makeEligible({ volunteerId: 'released', volunteerName: 'Bruno' }),
      ],
    });

    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [],
    });

    expect(ranking.ids).toEqual(['released']);
  });

  it('ranks unqualified volunteers last instead of dropping them (B-2)', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'greeter',
          volunteerName: 'Ana',
          qualifiedRoleIds: ['role-2'],
        }),
        makeEligible({ volunteerId: 'usher', volunteerName: 'Bruno' }),
      ],
    });

    // Qualification is a soft constraint with friction, not a hard filter
    // (B-2): the unqualified candidate is still ranked, just last.
    expect(
      rankVolunteersForShiftRole({ shift, roleId: 'role-1', assignments: [] })
        .ids,
    ).toEqual(['usher', 'greeter']);
  });

  it('ranks a conflicted qualified volunteer ahead of an unqualified one', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'unqualified',
          volunteerName: 'Ana',
          qualifiedRoleIds: ['role-2'],
        }),
        makeEligible({
          volunteerId: 'conflicted',
          volunteerName: 'Bruno',
          hasConflict: true,
        }),
      ],
    });

    // Fit tier order is ready → override → unqualified: a qualified person
    // who needs an availability override still outranks an unqualified one.
    expect(
      rankVolunteersForShiftRole({ shift, roleId: 'role-1', assignments: [] })
        .ids,
    ).toEqual(['conflicted', 'unqualified']);
  });

  it('badges nobody as ideal when the ministry has configured no qualifications', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'ana',
          volunteerName: 'Ana',
          qualifiedRoleIds: [],
        }),
        makeEligible({
          volunteerId: 'bruno',
          volunteerName: 'Bruno',
          qualifiedRoleIds: [],
        }),
      ],
    });

    // They are all assignable — with a reason each, mirroring the server's
    // NOT_QUALIFIED warning — but none of them is the obvious pick.
    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [],
    });
    expect(ranking.ids).toEqual(['ana', 'bruno']);
    expect(ranking.idealVolunteerId).toBeUndefined();
  });

  it('never badges an unavailable volunteer as the ideal pick', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'conflicted',
          volunteerName: 'Ana',
          hasConflict: true,
        }),
      ],
    });

    const ranking = rankVolunteersForShiftRole({
      shift,
      roleId: 'role-1',
      assignments: [],
    });

    expect(ranking.ids).toEqual(['conflicted']);
    expect(ranking.idealVolunteerId).toBeUndefined();
  });
});

describe('countWorkload', () => {
  it('counts only draft, pending and confirmed assignments (FR-017)', () => {
    const workload = countWorkload({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', status: 'draft' }),
        makeAssignment({ id: 'a-2', volunteerId: 'ana', status: 'pending' }),
        makeAssignment({ id: 'a-3', volunteerId: 'ana', status: 'confirmed' }),
        makeAssignment({ id: 'a-4', volunteerId: 'ana', status: 'declined' }),
        makeAssignment({ id: 'a-5', volunteerId: 'ana', status: 'cancelled' }),
      ],
    });

    expect(workload.get('ana')).toBe(3);
  });
});
