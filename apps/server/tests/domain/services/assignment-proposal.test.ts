import { type Instant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  RoleId,
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '@/domain/branded-ids';
import {
  type ProposalAssignment,
  type ProposalNeed,
  type ProposalShift,
  type ProposalVolunteer,
  proposeAssignments,
} from '@/domain/services/assignment-proposal';

const NOW = parseInstant({ value: '2026-10-01T12:00:00.000Z' });
const at = (day: string, hour: number): Instant =>
  parseInstant({
    value: `2026-10-${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  });

const SINGER = 'role-singer' as RoleId;
const GUITAR = 'role-guitar' as RoleId;
const ANA = 'v-ana' as VolunteerId;
const BRUNO = 'v-bruno' as VolunteerId;
const CARLA = 'v-carla' as VolunteerId;

interface ShiftFixtureInput {
  id: string;
  day: string;
  hour: number;
  cancelled?: boolean;
}

function shift({
  id,
  day,
  hour,
  cancelled = false,
}: ShiftFixtureInput): ProposalShift {
  return {
    shiftId: id as ShiftId,
    startTime: at(day, hour),
    endTime: at(day, hour + 2),
    cancelled,
  };
}

interface NeedFixtureInput {
  id: string;
  shiftId: string;
  roleId: RoleId;
  peopleNeeded?: number;
}

function need({
  id,
  shiftId,
  roleId,
  peopleNeeded = 1,
}: NeedFixtureInput): ProposalNeed {
  return {
    shiftRequirementId: id as ShiftRequirementId,
    shiftId: shiftId as ShiftId,
    roleId,
    peopleNeeded,
  };
}

interface VolunteerFixtureInput {
  id: VolunteerId;
  roleIds: RoleId[];
  confirmed?: boolean;
  unavailableShiftIds?: string[];
}

function volunteer({
  id,
  roleIds,
  confirmed = true,
  unavailableShiftIds = [],
}: VolunteerFixtureInput): ProposalVolunteer {
  return {
    volunteerId: id,
    roleIds,
    availability: confirmed ? 'confirmed' : 'not_confirmed',
    unavailableShiftIds: unavailableShiftIds as ShiftId[],
  };
}

interface ProposeFixtureInput {
  shifts: ProposalShift[];
  needs: ProposalNeed[];
  volunteers: ProposalVolunteer[];
  assignments?: ProposalAssignment[];
}

function propose({
  shifts,
  needs,
  volunteers,
  assignments = [],
}: ProposeFixtureInput) {
  return proposeAssignments({
    now: NOW,
    shifts,
    needs,
    volunteers,
    assignments,
  });
}

const placements = (result: ReturnType<typeof propose>) =>
  result.additions.map(
    ({ volunteerId, shiftRequirementId }) =>
      `${volunteerId as string}->${shiftRequirementId as string}`,
  );

describe('proposeAssignments', () => {
  it('protects the scarce qualification: Ana plays guitar, Bruno only sings', () => {
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [
        need({ id: 'sing', shiftId: 's1', roleId: SINGER }),
        need({ id: 'guitar', shiftId: 's1', roleId: GUITAR }),
      ],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER, GUITAR] }),
        volunteer({ id: BRUNO, roleIds: [SINGER] }),
      ],
    });

    expect(placements(result)).toEqual(['v-ana->guitar', 'v-bruno->sing']);
    expect(result.gaps).toEqual([]);
    expect(result.emptyReason).toBeNull();
  });

  it('counts a Shift once however many of its Roles and Sectors a Volunteer could fill', () => {
    // Ana matches three needs in one Shift; Bruno matches two needs in two
    // Shifts. Counting needs would pick Bruno; counting Shifts picks Ana.
    const result = propose({
      shifts: [
        shift({ id: 's1', day: '18', hour: 9 }),
        shift({ id: 's2', day: '25', hour: 9 }),
      ],
      needs: [
        need({ id: 's1-sing-a', shiftId: 's1', roleId: SINGER }),
        need({ id: 's1-sing-b', shiftId: 's1', roleId: SINGER }),
        need({ id: 's1-guitar', shiftId: 's1', roleId: GUITAR }),
        need({ id: 's2-guitar', shiftId: 's2', roleId: GUITAR }),
      ],
      volunteers: [
        volunteer({
          id: ANA,
          roleIds: [SINGER, GUITAR],
          unavailableShiftIds: ['s2'],
        }),
        volunteer({ id: BRUNO, roleIds: [GUITAR] }),
      ],
    });

    expect(result.additions[0]).toMatchObject({
      volunteerId: ANA,
      reason: { eligibleShiftCount: 1 },
    });
  });

  it('breaks equal opportunity by fewer Cycle Assignments across Ministries', () => {
    // Ana already serves another Ministry this Cycle; Bruno does not.
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [need({ id: 'sing', shiftId: 's1', roleId: SINGER })],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER] }),
        volunteer({ id: BRUNO, roleIds: [SINGER] }),
      ],
      assignments: [
        {
          volunteerId: ANA,
          shiftId: 'other-ministry' as ShiftId,
          startTime: at('20', 19),
          endTime: at('20', 21),
          inCycle: true,
        },
      ],
    });

    expect(placements(result)).toEqual(['v-bruno->sing']);
    expect(result.additions[0]?.reason.decidedBy).toBe(
      'fewest_cycle_assignments',
    );
  });

  it('ignores Assignments outside the Cycle for workload and breaks a full tie by stable order', () => {
    const volunteers = [
      volunteer({ id: BRUNO, roleIds: [SINGER] }),
      volunteer({ id: ANA, roleIds: [SINGER] }),
    ];
    const input = {
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [need({ id: 'sing', shiftId: 's1', roleId: SINGER })],
      assignments: [
        {
          volunteerId: ANA,
          shiftId: 'last-cycle' as ShiftId,
          startTime: at('02', 9),
          endTime: at('02', 11),
          inCycle: false,
        },
      ],
    };

    const result = propose({ ...input, volunteers });
    const reversed = propose({
      ...input,
      volunteers: [...volunteers].reverse(),
    });

    expect(placements(result)).toEqual(['v-ana->sing']);
    expect(result.additions[0]?.reason.decidedBy).toBe('stable_order');
    expect(reversed).toEqual(result);
  });

  it('counts proposed additions as workload and recalculates after every addition', () => {
    // Two equal Shifts for two singers: after Ana takes s1, her workload and
    // her overlap-free Shifts change, so Bruno takes s2 instead of Ana again.
    const result = propose({
      shifts: [
        shift({ id: 's1', day: '18', hour: 9 }),
        shift({ id: 's2', day: '25', hour: 9 }),
      ],
      needs: [
        need({ id: 's1-sing', shiftId: 's1', roleId: SINGER }),
        need({ id: 's2-sing', shiftId: 's2', roleId: SINGER }),
      ],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER] }),
        volunteer({ id: BRUNO, roleIds: [SINGER] }),
      ],
    });

    expect(placements(result)).toEqual(['v-ana->s1-sing', 'v-bruno->s2-sing']);
  });

  it('places a need of the chosen Volunteer on the earliest Shift when need scarcity ties', () => {
    const result = propose({
      shifts: [
        shift({ id: 'late', day: '25', hour: 9 }),
        shift({ id: 'early', day: '18', hour: 9 }),
      ],
      needs: [
        need({ id: 'a-late', shiftId: 'late', roleId: SINGER }),
        need({ id: 'b-early', shiftId: 'early', roleId: SINGER }),
      ],
      volunteers: [volunteer({ id: ANA, roleIds: [SINGER] })],
    });

    expect(placements(result)[0]).toBe('v-ana->b-early');
  });

  it('fills multi-person needs one place at a time and leaves the rest as a gap', () => {
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [
        need({ id: 'sing', shiftId: 's1', roleId: SINGER, peopleNeeded: 3 }),
      ],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER] }),
        volunteer({ id: BRUNO, roleIds: [SINGER] }),
      ],
    });

    expect(placements(result)).toEqual(['v-ana->sing', 'v-bruno->sing']);
    expect(result.gaps).toEqual([
      { shiftRequirementId: 'sing', shiftId: 's1', remaining: 1 },
    ]);
  });

  it('gives a Volunteer several non-overlapping Assignments but never two overlapping or two in one Shift', () => {
    const result = propose({
      shifts: [
        shift({ id: 'morning', day: '18', hour: 9 }),
        shift({ id: 'overlap', day: '18', hour: 10 }),
        shift({ id: 'evening', day: '18', hour: 18 }),
      ],
      needs: [
        need({ id: 'm-sing', shiftId: 'morning', roleId: SINGER }),
        need({ id: 'm-guitar', shiftId: 'morning', roleId: GUITAR }),
        need({ id: 'o-sing', shiftId: 'overlap', roleId: SINGER }),
        need({ id: 'e-sing', shiftId: 'evening', roleId: SINGER }),
      ],
      volunteers: [volunteer({ id: ANA, roleIds: [SINGER, GUITAR] })],
    });

    expect(placements(result)).toEqual(['v-ana->m-guitar', 'v-ana->e-sing']);
    expect(
      result.gaps.map(({ shiftRequirementId }) => shiftRequirementId),
    ).toEqual(['m-sing', 'o-sing']);
  });

  it('respects existing Assignments: filled places, same-Shift duplicates and cross-Ministry overlaps', () => {
    const result = propose({
      shifts: [
        shift({ id: 's1', day: '18', hour: 9 }),
        shift({ id: 's2', day: '25', hour: 9 }),
      ],
      needs: [
        need({ id: 's1-sing', shiftId: 's1', roleId: SINGER, peopleNeeded: 2 }),
        need({ id: 's1-guitar', shiftId: 's1', roleId: GUITAR }),
        need({ id: 's2-sing', shiftId: 's2', roleId: SINGER }),
      ],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER, GUITAR] }),
        volunteer({ id: BRUNO, roleIds: [SINGER] }),
        volunteer({ id: CARLA, roleIds: [SINGER] }),
      ],
      assignments: [
        // Ana already sings in s1: one place left there, and not for her.
        {
          volunteerId: ANA,
          shiftId: 's1' as ShiftId,
          shiftRequirementId: 's1-sing' as ShiftRequirementId,
          startTime: at('18', 9),
          endTime: at('18', 11),
          inCycle: true,
        },
        // Bruno serves another Ministry at the same time as s2.
        {
          volunteerId: BRUNO,
          shiftId: 'kids' as ShiftId,
          startTime: at('25', 10),
          endTime: at('25', 12),
          inCycle: true,
        },
      ],
    });

    // Ana and Bruno tie (one Shift, one Assignment); once Ana takes s2,
    // Carla's single Shift and empty workload beat Bruno for s1.
    expect(placements(result)).toEqual(['v-ana->s2-sing', 'v-carla->s1-sing']);
    expect(result.gaps).toEqual([
      { shiftRequirementId: 's1-guitar', shiftId: 's1', remaining: 1 },
    ]);
  });

  it('treats an overfilled need as full', () => {
    const existing = (volunteerId: VolunteerId): ProposalAssignment => ({
      volunteerId,
      shiftId: 's1' as ShiftId,
      shiftRequirementId: 'sing' as ShiftRequirementId,
      startTime: at('18', 9),
      endTime: at('18', 11),
      inCycle: true,
    });
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [need({ id: 'sing', shiftId: 's1', roleId: SINGER })],
      volunteers: [volunteer({ id: CARLA, roleIds: [SINGER] })],
      assignments: [existing(ANA), existing(BRUNO)],
    });

    expect(result.additions).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.emptyReason).toBe('no_open_needs');
  });

  it('uses only confirmed availability, honours UnavailableShifts and counts unconfirmed Volunteers', () => {
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [
        need({ id: 'sing', shiftId: 's1', roleId: SINGER, peopleNeeded: 3 }),
      ],
      volunteers: [
        volunteer({ id: ANA, roleIds: [SINGER], confirmed: false }),
        volunteer({
          id: BRUNO,
          roleIds: [SINGER],
          unavailableShiftIds: ['s1'],
        }),
        volunteer({ id: CARLA, roleIds: [SINGER] }),
      ],
    });

    expect(placements(result)).toEqual(['v-carla->sing']);
    expect(result.excludedUnconfirmedCount).toBe(1);
  });

  it('skips started and cancelled Shifts entirely', () => {
    const result = propose({
      shifts: [
        {
          shiftId: 'started' as ShiftId,
          startTime: parseInstant({ value: '2026-10-01T11:00:00.000Z' }),
          endTime: parseInstant({ value: '2026-10-01T13:00:00.000Z' }),
          cancelled: false,
        },
        shift({ id: 'cancelled', day: '18', hour: 9, cancelled: true }),
      ],
      needs: [
        need({ id: 'started-sing', shiftId: 'started', roleId: SINGER }),
        need({ id: 'cancelled-sing', shiftId: 'cancelled', roleId: SINGER }),
      ],
      volunteers: [volunteer({ id: ANA, roleIds: [SINGER] })],
    });

    expect(result.additions).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.emptyReason).toBe('no_open_needs');
  });

  it('explains an empty result with no confirmed responses', () => {
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [need({ id: 'sing', shiftId: 's1', roleId: SINGER })],
      volunteers: [volunteer({ id: ANA, roleIds: [SINGER], confirmed: false })],
    });

    expect(result).toEqual({
      additions: [],
      gaps: [{ shiftRequirementId: 'sing', shiftId: 's1', remaining: 1 }],
      excludedUnconfirmedCount: 1,
      emptyReason: 'no_confirmed_responses',
    });
  });

  it('stops at zero opportunities and explains an empty result with no eligible placement', () => {
    const result = propose({
      shifts: [shift({ id: 's1', day: '18', hour: 9 })],
      needs: [need({ id: 'guitar', shiftId: 's1', roleId: GUITAR })],
      volunteers: [volunteer({ id: BRUNO, roleIds: [SINGER] })],
    });

    expect(result.additions).toEqual([]);
    expect(result.emptyReason).toBe('no_eligible_placements');
  });
});
