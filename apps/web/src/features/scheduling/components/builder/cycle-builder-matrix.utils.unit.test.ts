import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countWorkload,
  deriveEventDates,
  enumerateDates,
  eventMatchesDateSpan,
  eventOccursOnDay,
  eventSlotsOnDay,
  findShiftById,
  focusKey,
  overrideKindForFit,
  rankVolunteersForShiftRole,
  roleHasRoom,
  staffingStatusClasses,
  summarizeCycleStaffing,
  volunteerFitForShiftRole,
} from './cycle-builder-matrix.utils';
import type {
  CycleBuilderAssignment,
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

/**
 * Every case here runs in a west-of-UTC zone on purpose. The bug these guard
 * against is invisible at UTC: it only appears once a church-local day and a
 * UTC day stop lining up.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

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

/**
 * Mirrors the real `teste` row: a single church-local Monday stored as
 * local-midnight → local 23:59, which in UTC-3 straddles two UTC dates.
 */
function makeEvent(
  overrides: Partial<CycleBuilderEventSummary> = {},
): CycleBuilderEventSummary {
  return {
    participationId: 'participation-1',
    state: 'rostering',
    eventId: 'event-1',
    title: 'teste',
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

describe('deriveEventDates', () => {
  it('gives a one-local-day event exactly one column', () => {
    expect(deriveEventDates({ events: [makeEvent()] })).toEqual(['2027-01-04']);
  });

  it('does not grow a phantom next day for the real Janeiro cycle', () => {
    const events = [
      makeEvent(),
      makeEvent({
        eventId: 'event-2',
        title: 'segunda da benção',
        startDate: '2027-01-11T03:00:00.000Z',
        endDate: '2027-01-12T02:59:59.999Z',
        slots: [
          makeSlot({
            slotId: 'slot-3',
            startTime: '2027-01-11T12:00:00.000Z',
            endTime: '2027-01-11T15:00:00.000Z',
            shifts: [
              makeShift({
                shiftId: 'shift-3',
                startTime: '2027-01-11T12:00:00.000Z',
                endTime: '2027-01-11T15:00:00.000Z',
              }),
            ],
          }),
        ],
      }),
    ];

    // No 2027-01-05, no 2027-01-12.
    expect(deriveEventDates({ events })).toEqual(['2027-01-04', '2027-01-11']);
  });

  it('collapses two slots on one day into a single column', () => {
    const event = makeEvent({
      slots: [
        makeSlot({ slotId: 'manha', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'tarde', startTime: '2027-01-04T19:00:00.000Z' }),
      ],
    });

    expect(deriveEventDates({ events: [event] })).toEqual(['2027-01-04']);
  });

  it('keeps a column for an event that has no slots yet', () => {
    expect(deriveEventDates({ events: [makeEvent({ slots: [] })] })).toEqual([
      '2027-01-04',
    ]);
  });

  it('lists each day of a genuinely multi-day event that serves on both', () => {
    const event = makeEvent({
      endDate: '2027-01-06T02:59:59.999Z',
      slots: [
        makeSlot({ slotId: 'day-1', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'day-2', startTime: '2027-01-05T12:00:00.000Z' }),
      ],
    });

    expect(deriveEventDates({ events: [event] })).toEqual([
      '2027-01-04',
      '2027-01-05',
    ]);
  });
});

describe('eventOccursOnDay', () => {
  it('claims only the day it serves, so a shift renders in one column', () => {
    const event = makeEvent();
    expect(eventOccursOnDay({ event, day: '2027-01-04' })).toBe(true);
    expect(eventOccursOnDay({ event, day: '2027-01-05' })).toBe(false);
  });

  it('claims every day of a genuinely multi-day event', () => {
    const event = makeEvent({ endDate: '2027-01-06T02:59:59.999Z' });
    expect(eventOccursOnDay({ event, day: '2027-01-05' })).toBe(true);
  });
});

describe('eventSlotsOnDay', () => {
  it('keeps an evening slot on the day it is served, not the next UTC day', () => {
    // 21:00 local Monday = 00:00Z Tuesday — the shape that also breaks the
    // tailoring page's day grouping.
    const eveningSlot = makeSlot({
      slotId: 'noite',
      startTime: '2027-01-05T00:00:00.000Z',
      endTime: '2027-01-05T02:00:00.000Z',
    });
    const event = makeEvent({ slots: [eveningSlot] });

    expect(eventSlotsOnDay({ event, day: '2027-01-04' })).toEqual([
      eveningSlot,
    ]);
    expect(eventSlotsOnDay({ event, day: '2027-01-05' })).toEqual([]);
  });

  it('gives each day of a multi-day event only its own slots', () => {
    const dayOne = makeSlot({
      slotId: 'day-1',
      startTime: '2027-01-04T12:00:00.000Z',
    });
    const dayTwo = makeSlot({
      slotId: 'day-2',
      startTime: '2027-01-05T12:00:00.000Z',
    });
    const event = makeEvent({
      endDate: '2027-01-06T02:59:59.999Z',
      slots: [dayOne, dayTwo],
    });

    // Rendering the whole slot list per column is what made one assignment
    // look like it had landed on several days.
    expect(eventSlotsOnDay({ event, day: '2027-01-04' })).toEqual([dayOne]);
    expect(eventSlotsOnDay({ event, day: '2027-01-05' })).toEqual([dayTwo]);
  });
});

describe('eventMatchesDateSpan', () => {
  it('reads the event span in local days', () => {
    const event = makeEvent();
    // The Jan 5 UTC end bound must not push the event outside a Jan 4 range.
    expect(
      eventMatchesDateSpan({
        event,
        mode: 'within',
        rangeStart: '2027-01-04',
        rangeEnd: '2027-01-04',
      }),
    ).toBe(true);
  });

  it('still excludes an event outside the range', () => {
    expect(
      eventMatchesDateSpan({
        event: makeEvent(),
        mode: 'starts',
        rangeStart: '2027-01-06',
        rangeEnd: '2027-01-31',
      }),
    ).toBe(false);
  });
});

describe('enumerateDates', () => {
  it('walks cycle bounds without dropping or adding a day', () => {
    const dates = enumerateDates({
      startDate: '2027-01-01T00:00:00.000Z',
      endDate: '2027-01-31T00:00:00.000Z',
    });

    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe('2027-01-01');
    expect(dates.at(-1)).toBe('2027-01-31');
  });
});

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

describe('focusKey', () => {
  it('separates two roles inside the same shift', () => {
    expect(focusKey({ shiftId: 'shift-1', roleId: 'role-1' })).not.toBe(
      focusKey({ shiftId: 'shift-1', roleId: 'role-2' }),
    );
  });
});

describe('volunteerFitForShiftRole', () => {
  const shift = makeShift({
    eligibleVolunteers: [
      makeEligible({ volunteerId: 'ready', volunteerName: 'Ana' }),
      makeEligible({
        volunteerId: 'silent',
        volunteerName: 'Bruno',
        isAvailable: false,
      }),
      makeEligible({
        volunteerId: 'conflicted',
        volunteerName: 'Carla',
        hasConflict: true,
      }),
      makeEligible({
        volunteerId: 'other-role',
        volunteerName: 'Diego',
        qualifiedRoleIds: ['role-2'],
      }),
    ],
  });

  it('reads a qualified, free volunteer as ready', () => {
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'ready',
      }),
    ).toEqual({ tier: 'ready' });
  });

  it('reads a qualified but unavailable or double-booked volunteer as an override', () => {
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'silent',
      }),
    ).toEqual({ tier: 'override', conflictType: 'unavailable' });
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'conflicted',
      }),
    ).toEqual({ tier: 'override', conflictType: 'double_booked' });
  });

  it('reads another role’s qualification as unqualified, not as a non-candidate', () => {
    // Assignable with a reason: the server warns NOT_QUALIFIED and only
    // refuses under hard enforcement when no override reason came with it.
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'other-role',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: undefined });
  });

  it('carries the availability conflict on an unqualified fit so one dialog covers both', () => {
    const doubleTrouble = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'ana',
          volunteerName: 'Ana',
          qualifiedRoleIds: ['role-2'],
          hasConflict: true,
        }),
      ],
    });

    expect(
      volunteerFitForShiftRole({
        shift: doubleTrouble,
        roleId: 'role-1',
        volunteerId: 'ana',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: 'double_booked' });
  });

  it('offers nothing for someone who is not a candidate for this shift at all', () => {
    // `none` now means exactly one thing — not in this shift's eligible pool,
    // which the server rejects hard as NOT_IN_MINISTRY. No gesture offers it.
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'stranger',
      }),
    ).toEqual({ tier: 'none' });
  });

  it('reads an unconfigured ministry as unqualified rather than as an empty board', () => {
    const unconfigured = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'ana',
          volunteerName: 'Ana',
          qualifiedRoleIds: [],
        }),
      ],
    });

    expect(
      volunteerFitForShiftRole({
        shift: unconfigured,
        roleId: 'role-1',
        volunteerId: 'ana',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: undefined });
  });
});

describe('overrideKindForFit', () => {
  it('asks for no reason when the fit is ready', () => {
    expect(overrideKindForFit({ fit: { tier: 'ready' } })).toBeUndefined();
    expect(overrideKindForFit({ fit: { tier: 'none' } })).toBeUndefined();
  });

  it('forwards the availability conflict of an override fit', () => {
    expect(
      overrideKindForFit({
        fit: { tier: 'override', conflictType: 'double_booked' },
      }),
    ).toBe('double_booked');
  });

  it('reports qualification ahead of availability, so one reason covers both', () => {
    expect(
      overrideKindForFit({
        fit: { tier: 'unqualified', conflictType: 'unavailable' },
      }),
    ).toBe('not_qualified');
  });
});

describe('volunteerFitForShiftRole conflict cause', () => {
  it('names the conflict so an override can reach the reason dialog (FR-016)', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'double-booked',
          volunteerName: 'Ana',
          hasConflict: true,
        }),
        makeEligible({
          volunteerId: 'unavailable',
          volunteerName: 'Bruno',
          isAvailable: false,
        }),
      ],
    });

    const doubleBooked = volunteerFitForShiftRole({
      shift,
      roleId: 'role-1',
      volunteerId: 'double-booked',
    });
    const unavailable = volunteerFitForShiftRole({
      shift,
      roleId: 'role-1',
      volunteerId: 'unavailable',
    });

    expect(doubleBooked).toEqual({
      tier: 'override',
      conflictType: 'double_booked',
    });
    expect(unavailable).toEqual({
      tier: 'override',
      conflictType: 'unavailable',
    });
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

describe('roleHasRoom', () => {
  it('has room while active assignments sit below the required headcount', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 2 }],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(true);
  });

  it('is full once active assignments reach the headcount', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 1 }],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(false);
  });

  it('ignores cancelled and declined assignments against the ceiling', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 1 }],
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', status: 'cancelled' }),
        makeAssignment({ id: 'a-2', volunteerId: 'bruno', status: 'declined' }),
      ],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(true);
  });

  it('has no room for a role with no requirement at all', () => {
    const shift = makeShift({ requirements: [], assignments: [] });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(false);
  });
});

describe('findShiftById', () => {
  it('finds a shift nested in any event slot, or returns undefined', () => {
    const data = {
      events: [makeEvent({ slots: [makeSlot({ shifts: [makeShift()] })] })],
      assignments: [],
      roles: [],
    };

    expect(findShiftById({ data, shiftId: 'shift-1' })?.shiftId).toBe(
      'shift-1',
    );
    expect(findShiftById({ data, shiftId: 'nope' })).toBeUndefined();
  });
});

describe('summarizeCycleStaffing (B-4)', () => {
  it('counts filled, required and shifts below target across included slots', () => {
    const data = {
      events: [
        makeEvent({
          slots: [
            makeSlot({
              shifts: [
                makeShift({
                  shiftId: 'shift-1',
                  requiredCount: 2,
                  assignedCount: 2,
                }),
                makeShift({
                  shiftId: 'shift-2',
                  requiredCount: 3,
                  assignedCount: 1,
                }),
              ],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 3,
      required: 5,
      percent: 60,
      shiftsBelowTarget: 1,
    });
  });

  it('ignores slots this ministry is not serving, so the denominator cannot lie', () => {
    const data = {
      events: [
        makeEvent({
          slots: [
            makeSlot({
              slotId: 'slot-included',
              shifts: [makeShift({ requiredCount: 2, assignedCount: 1 })],
            }),
            makeSlot({
              slotId: 'slot-excluded',
              included: false,
              shifts: [
                makeShift({
                  shiftId: 'shift-x',
                  requiredCount: 9,
                  assignedCount: 0,
                }),
              ],
            }),
          ],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 1,
      required: 2,
      percent: 50,
      shiftsBelowTarget: 1,
    });
  });

  it('reports 0% rather than dividing by zero when nothing is required yet', () => {
    const data = {
      events: [
        makeEvent({
          slots: [makeSlot({ shifts: [makeShift({ requiredCount: 0 })] })],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(summarizeCycleStaffing({ data })).toEqual({
      filled: 0,
      required: 0,
      percent: 0,
      shiftsBelowTarget: 0,
    });
  });
});

describe('staffingStatusClasses', () => {
  it('stays neutral with no requirement, and grades green / amber / red above it', () => {
    expect(
      staffingStatusClasses({ percent: 0, hasRequirement: false }).text,
    ).toBe('text-muted-foreground');
    expect(
      staffingStatusClasses({ percent: 100, hasRequirement: true }).bar,
    ).toBe('bg-green-600');
    expect(
      staffingStatusClasses({ percent: 50, hasRequirement: true }).bar,
    ).toBe('bg-yellow-500');
    expect(
      staffingStatusClasses({ percent: 49, hasRequirement: true }).bar,
    ).toBe('bg-destructive');
  });
});
