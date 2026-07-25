import { describe, expect, it } from 'vitest';
import {
  assignableFits,
  assignedVolunteerIdsForShift,
  buildCellDerivedIndex,
  buildShiftAssignmentIndex,
  candidates,
  recommendations,
} from './cycle-builder-assignment-index.utils';
import { focusKey } from './cycle-builder-shift-lookup.utils';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

/**
 * The four functions that decide *who a leader is offered* — `candidates()`,
 * `recommendations()`, `assignableFits()` and `buildCellDerivedIndex()` — had
 * no direct coverage: they were only ever exercised by mounting the whole
 * board. That is exactly the arrangement that let B-2's qualification
 * regression ship twice, because the picker and dialog tests hand-built
 * `isQualified: false` instead of driving the real candidate functions.
 *
 * So these tests build a `CycleBuilderData` and run the genuine
 * `buildShiftAssignmentIndex` → `candidates`/`recommendations` path, never a
 * hand-assembled index.
 */

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
    requirements: [{ roleId: 'role-1', requiredCount: 1 }],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeSlot(
  overrides: Partial<CycleBuilderSlotSummary> = {},
): CycleBuilderSlotSummary {
  return {
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    requiredCount: 1,
    assignedCount: 0,
    shiftCount: 1,
    shifts: [makeShift()],
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<CycleBuilderEventSummary> = {},
): CycleBuilderEventSummary {
  return {
    participationId: 'participation-1',
    state: 'rostering',
    eventId: 'event-1',
    title: 'Sunday service',
    startDate: '2027-01-04T03:00:00.000Z',
    endDate: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    eventType: 'hourly',
    fillRatio: 0,
    requiredCount: 1,
    assignedCount: 0,
    slotCount: 1,
    slots: [makeSlot()],
    ...overrides,
  };
}

function makeData(overrides: Partial<CycleBuilderData> = {}): CycleBuilderData {
  return {
    events: [
      makeEvent({
        slots: [
          makeSlot({
            shifts: [
              makeShift({ shiftId: 'shift-1', label: 'Morning' }),
              makeShift({ shiftId: 'shift-2', label: 'Evening' }),
            ],
          }),
        ],
      }),
    ],
    assignments: [],
    roles: [
      { id: 'role-1', name: 'Sound' },
      { id: 'role-2', name: 'Vocals' },
    ],
    ...overrides,
  };
}

/** The real index, built the way the board builds it. */
function indexFor(data: CycleBuilderData) {
  return buildShiftAssignmentIndex({ data });
}

describe('buildShiftAssignmentIndex', () => {
  it('counts cycle workload only for active assignments', () => {
    const data = makeData({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', shiftId: 'shift-1' }),
        makeAssignment({ id: 'a-2', volunteerId: 'ana', shiftId: 'shift-2' }),
        makeAssignment({
          id: 'a-3',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          status: 'cancelled',
        }),
        makeAssignment({ id: 'a-4', volunteerId: 'bruno', status: 'declined' }),
      ],
    });

    const { workload } = buildShiftAssignmentIndex({ data });

    expect(workload.get('ana')).toBe(2);
    expect(workload.has('bruno')).toBe(false);
  });

  it('groups active shift-bound assignments by volunteer with role + shift labels', () => {
    const data = makeData({
      assignments: [
        makeAssignment({
          id: 'a-1',
          volunteerId: 'ana',
          shiftId: 'shift-1',
          roleId: 'role-1',
        }),
        makeAssignment({
          id: 'a-2',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          roleId: 'role-2',
        }),
      ],
    });

    const { activeAssignmentsByVolunteerId } = buildShiftAssignmentIndex({
      data,
    });

    const anaContexts = activeAssignmentsByVolunteerId.get('ana');
    expect(anaContexts).toHaveLength(2);
    expect(anaContexts?.[0].detail).toContain('Sunday service');
    expect(anaContexts?.[0].detail).toContain('Morning');
    expect(anaContexts?.[0].detail).toContain('Sound');
    expect(anaContexts?.[1].summary).toContain('Vocals');
  });

  it('still counts workload for an assignment whose shift is unknown, but files no context', () => {
    const data = makeData({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', shiftId: 'ghost' }),
      ],
    });

    const index = buildShiftAssignmentIndex({ data });

    expect(index.workload.get('ana')).toBe(1);
    expect(index.activeAssignmentsByVolunteerId.has('ana')).toBe(false);
  });
});

describe('assignedVolunteerIdsForShift', () => {
  it('returns active assignees of the shift and drops inactive ones', () => {
    const shift = makeShift({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana' }),
        makeAssignment({ id: 'a-2', volunteerId: 'bruno', status: 'draft' }),
        makeAssignment({
          id: 'a-3',
          volunteerId: 'carla',
          status: 'cancelled',
        }),
      ],
    });

    const ids = assignedVolunteerIdsForShift({ shift });

    expect([...ids].sort()).toEqual(['ana', 'bruno']);
  });
});

describe('candidates', () => {
  it('lists an unqualified volunteer, badged as needing a reason rather than hidden', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'ana', volunteerName: 'Ana' }),
        makeEligible({
          volunteerId: 'diego',
          volunteerName: 'Diego',
          qualifiedRoleIds: ['role-2'],
        }),
      ],
    });

    const rows = candidates({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    // B-2: qualification is a soft constraint. Hiding Diego here is the exact
    // regression that shipped twice — the rail would say "no candidates" while
    // this picker offered him, or vice versa.
    expect(rows.map((row) => row.id)).toEqual(['ana', 'diego']);
    expect(rows.find((row) => row.id === 'diego')?.isQualified).toBe(false);
    expect(rows.find((row) => row.id === 'ana')?.isQualified).toBe(true);
  });

  it('drops volunteers already actively serving this shift, keeping cancelled ones available', () => {
    const shift = makeShift({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana' }),
        makeAssignment({
          id: 'a-2',
          volunteerId: 'bruno',
          status: 'cancelled',
        }),
      ],
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'ana', volunteerName: 'Ana' }),
        makeEligible({ volunteerId: 'bruno', volunteerName: 'Bruno' }),
      ],
    });

    const rows = candidates({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    expect(rows.map((row) => row.id)).toEqual(['bruno']);
  });

  it('translates availability into the picker vocabulary', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'free', volunteerName: 'Ana' }),
        makeEligible({
          volunteerId: 'silent',
          volunteerName: 'Bruno',
          isAvailable: false,
        }),
        makeEligible({
          volunteerId: 'clashing',
          volunteerName: 'Carla',
          hasConflict: true,
        }),
      ],
    });

    const byId = new Map(
      candidates({
        shift,
        roleId: 'role-1',
        index: indexFor(makeData()),
      }).map((row) => [row.id, row.availabilityStatus]),
    );

    expect(byId.get('free')).toBe('available');
    expect(byId.get('silent')).toBe('no_response');
    expect(byId.get('clashing')).toBe('unavailable');
  });

  it('carries the cycle workload and the assignments held elsewhere', () => {
    const data = makeData({
      assignments: [
        makeAssignment({
          id: 'a-1',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          roleId: 'role-2',
        }),
        makeAssignment({
          id: 'a-2',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          roleId: 'role-1',
        }),
      ],
    });
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'ana', volunteerName: 'Ana' }),
      ],
    });

    const [ana] = candidates({
      shift,
      roleId: 'role-1',
      index: indexFor(data),
    });

    expect(ana.alreadyAssignedCount).toBe(2);
    expect(ana.alreadyServingAssignments).toHaveLength(2);
    expect(ana.alreadyServingAssignments?.[0].summary).toContain('Vocals');
  });
});

describe('recommendations', () => {
  it('never recommends an unqualified volunteer into any group', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'unqualified-free',
          volunteerName: 'Ana',
          qualifiedRoleIds: ['role-2'],
        }),
        makeEligible({
          volunteerId: 'unqualified-silent',
          volunteerName: 'Bruno',
          qualifiedRoleIds: ['role-2'],
          isAvailable: false,
        }),
        makeEligible({
          volunteerId: 'unqualified-clashing',
          volunteerName: 'Carla',
          qualifiedRoleIds: ['role-2'],
          hasConflict: true,
        }),
      ],
    });

    const groups = recommendations({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    // Recommending is a stronger claim than listing: `candidates()` offers
    // these three, but nobody is *suggested* into an override reason they did
    // not go looking for. This is the `isRecommendableFit()` bar.
    expect(groups.safe).toEqual([]);
    expect(groups.needsResponse).toEqual([]);
    expect(groups.conflicts).toEqual([]);
    expect(
      candidates({ shift, roleId: 'role-1', index: indexFor(makeData()) }),
    ).toHaveLength(3);
  });

  it('splits qualified volunteers into safe, needs-response and conflict groups', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'free', volunteerName: 'Ana' }),
        makeEligible({
          volunteerId: 'silent',
          volunteerName: 'Bruno',
          isAvailable: false,
        }),
        makeEligible({
          volunteerId: 'clashing',
          volunteerName: 'Carla',
          hasConflict: true,
        }),
      ],
    });

    const groups = recommendations({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    expect(groups.safe.map((row) => row.id)).toEqual(['free']);
    expect(groups.needsResponse.map((row) => row.id)).toEqual(['silent']);
    expect(groups.conflicts.map((row) => row.id)).toEqual(['clashing']);
    expect(groups.conflicts[0].conflictType).toBe('double_booked');
  });

  it('orders safe picks by longest-since-served ahead of alphabetical order', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'recent',
          volunteerName: 'Ana',
          lastServedAt: '2027-06-01T12:00:00.000Z',
        }),
        makeEligible({
          volunteerId: 'older',
          volunteerName: 'Bruno',
          lastServedAt: '2027-01-01T12:00:00.000Z',
        }),
        makeEligible({ volunteerId: 'never', volunteerName: 'Zara' }),
      ],
    });

    const groups = recommendations({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    // Exactly reverse-alphabetical, so a regression to name-ordering fails
    // loudly: never-served first, then longest-ago, then most recent (FR-017).
    expect(groups.safe.map((row) => row.id)).toEqual([
      'never',
      'older',
      'recent',
    ]);
  });

  it('breaks a recency tie on lighter cycle workload, then on name', () => {
    const servedAt = '2027-01-01T12:00:00.000Z';
    const data = makeData({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'busy', shiftId: 'shift-2' }),
        makeAssignment({ id: 'a-2', volunteerId: 'busy', shiftId: 'shift-2' }),
      ],
    });
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'busy',
          volunteerName: 'Ana',
          lastServedAt: servedAt,
        }),
        makeEligible({
          volunteerId: 'idle-z',
          volunteerName: 'Zara',
          lastServedAt: servedAt,
        }),
        makeEligible({
          volunteerId: 'idle-b',
          volunteerName: 'Bruno',
          lastServedAt: servedAt,
        }),
      ],
    });

    const groups = recommendations({
      shift,
      roleId: 'role-1',
      index: indexFor(data),
    });

    expect(groups.safe.map((row) => row.id)).toEqual([
      'idle-b',
      'idle-z',
      'busy',
    ]);
    expect(groups.safe.at(-1)?.workloadCount).toBe(2);
  });

  it('caps each group at five and excludes this shift’s own assignees', () => {
    const shift = makeShift({
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'serving' })],
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'serving', volunteerName: 'Serving' }),
        ...Array.from({ length: 7 }, (_unused, position) =>
          makeEligible({
            volunteerId: `free-${position}`,
            volunteerName: `Free ${position}`,
          }),
        ),
      ],
    });

    const groups = recommendations({
      shift,
      roleId: 'role-1',
      index: indexFor(makeData()),
    });

    expect(groups.safe).toHaveLength(5);
    expect(groups.safe.map((row) => row.id)).not.toContain('serving');
  });
});

describe('assignableFits', () => {
  it('offers every eligible tier including unqualified, and honours exclusions', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'ready', volunteerName: 'Ana' }),
        makeEligible({
          volunteerId: 'override',
          volunteerName: 'Bruno',
          hasConflict: true,
        }),
        makeEligible({
          volunteerId: 'unqualified',
          volunteerName: 'Carla',
          qualifiedRoleIds: ['role-2'],
        }),
        makeEligible({ volunteerId: 'excluded', volunteerName: 'Diego' }),
      ],
    });

    const fits = assignableFits({
      shift,
      roleId: 'role-1',
      excludedVolunteerIds: new Set(['excluded']),
    });

    expect(fits.get('ready')).toBe('ready');
    expect(fits.get('override')).toBe('override');
    expect(fits.get('unqualified')).toBe('unqualified');
    expect(fits.has('excluded')).toBe(false);
  });

  it('excludes nobody when no exclusion set is supplied', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({ volunteerId: 'ana', volunteerName: 'Ana' }),
      ],
    });

    expect(
      assignableFits({ shift, roleId: 'role-1', excludedVolunteerIds: null }),
    ).toEqual(new Map([['ana', 'ready']]));
  });
});

describe('buildCellDerivedIndex', () => {
  it('derives one entry per shift×role requirement, keyed the way cells look them up', () => {
    const eligibleVolunteers = [
      makeEligible({
        volunteerId: 'ana',
        volunteerName: 'Ana',
        qualifiedRoleIds: ['role-1', 'role-2'],
      }),
      makeEligible({
        volunteerId: 'diego',
        volunteerName: 'Diego',
        qualifiedRoleIds: ['role-2'],
      }),
    ];
    const data = makeData({
      events: [
        makeEvent({
          slots: [
            makeSlot({
              shifts: [
                makeShift({
                  shiftId: 'shift-1',
                  requirements: [
                    { roleId: 'role-1', requiredCount: 1 },
                    { roleId: 'role-2', requiredCount: 1 },
                  ],
                  eligibleVolunteers,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const derived = buildCellDerivedIndex({ data, index: indexFor(data) });

    expect([...derived.keys()].sort()).toEqual(
      [
        focusKey({ shiftId: 'shift-1', roleId: 'role-1' }),
        focusKey({ shiftId: 'shift-1', roleId: 'role-2' }),
      ].sort(),
    );
    // Per-role, not per-shift: Diego is unqualified for Sound so he is listed
    // but never recommended there, while for Vocals he is a safe pick.
    const sound = derived.get(
      focusKey({ shiftId: 'shift-1', roleId: 'role-1' }),
    );
    const vocals = derived.get(
      focusKey({ shiftId: 'shift-1', roleId: 'role-2' }),
    );
    expect(sound?.candidates.map((row) => row.id)).toEqual(['ana', 'diego']);
    expect(sound?.recommendations.safe.map((row) => row.id)).toEqual(['ana']);
    expect(vocals?.recommendations.safe.map((row) => row.id)).toEqual([
      'ana',
      'diego',
    ]);
  });

  it('skips shifts that declare no requirements', () => {
    const data = makeData({
      events: [
        makeEvent({
          slots: [makeSlot({ shifts: [makeShift({ requirements: [] })] })],
        }),
      ],
    });

    expect(buildCellDerivedIndex({ data, index: indexFor(data) }).size).toBe(0);
  });
});
