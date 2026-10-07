import {
  assignment,
  event,
  ministryParticipation,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  planningCycle,
  shift,
  slotRequirement,
} from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  createRosterQualificationRecipe,
  type RosterQualificationJourney,
} from '../../seeds/e2e/recipes/roster-qualification';
import {
  createRosteringBoardRecipe,
  type RosteringBoardJourney,
} from '../../seeds/e2e/recipes/rostering-board';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** After 2026-12-28, the last day the legacy seed's fixed events used. */
const LATE_ANCHOR: CalendarDay = parseCalendarDay({ value: '2027-03-01' });
/** Its events cross into January, and its cycle into the next year. */
const YEAR_END_ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-12-28' });

interface AnchorInput {
  anchor: CalendarDay;
}

async function loadBoard({
  anchor,
}: AnchorInput): Promise<RosteringBoardJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createRosteringBoardRecipe({ journeyKey: 'alpha', anchor }),
  });
}

async function loadQualification({
  anchor,
}: AnchorInput): Promise<RosterQualificationJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createRosterQualificationRecipe({ journeyKey: 'alpha', anchor }),
  });
}

interface VolunteerIdInput {
  volunteerId: string;
}

async function qualifiedRoleIds({
  volunteerId,
}: VolunteerIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ roleId: ministryVolunteerRole.roleId })
    .from(ministryVolunteerRole)
    .innerJoin(
      ministryVolunteer,
      eq(ministryVolunteer.id, ministryVolunteerRole.ministryVolunteerId),
    )
    .where(eq(ministryVolunteer.volunteerId, volunteerId));
  return rows.map((row) => row.roleId).sort();
}

interface TeamIdInput {
  teamId: string;
}

async function teamMembers({ teamId }: TeamIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ volunteerId: ministryVolunteer.volunteerId })
    .from(ministryVolunteerTeam)
    .innerJoin(
      ministryVolunteer,
      eq(ministryVolunteer.id, ministryVolunteerTeam.ministryVolunteerId),
    )
    .where(eq(ministryVolunteerTeam.teamId, teamId));
  return rows.map((row) => row.volunteerId).sort();
}

interface EventIdInput {
  eventId: string;
}

async function eventRows({ eventId }: EventIdInput) {
  const [eventRow] = await testDb
    .select()
    .from(event)
    .where(eq(event.id, eventId));
  const [shiftRow] = await testDb
    .select()
    .from(shift)
    .innerJoin(
      ministryParticipation,
      eq(ministryParticipation.id, shift.participationId),
    )
    .where(eq(ministryParticipation.eventId, eventId));
  return { eventRow, shiftRow };
}

beforeEach(async () => {
  await truncateAll();
  await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
});

describe('rostering-board E2E journey recipe', () => {
  it('builds a published two-Usher service, an availability-fired team service and a published Host service', async () => {
    const journey = await loadBoard({ anchor: ANCHOR });
    const { service, teamService, rosteredService } = journey.events;
    const { worship } = journey.ministries;

    expect(service.day).toBe('2026-03-22');
    expect(teamService.day).toBe('2026-03-25');
    // America/Sao_Paulo is UTC-3 all year: 09:00–11:00 local.
    expect(service.startsAt).toBe('2026-03-22T12:00:00.000Z');
    expect(teamService.endsAt).toBe('2026-03-25T14:00:00.000Z');

    const participations = await testDb
      .select({
        id: ministryParticipation.id,
        state: ministryParticipation.state,
      })
      .from(ministryParticipation)
      .where(eq(ministryParticipation.churchId, journey.church.id));
    expect(participations).toEqual(
      expect.arrayContaining([
        { id: service.participationId, state: 'published' },
        { id: teamService.participationId, state: 'availability_fired' },
        { id: rosteredService.participationId, state: 'published' },
      ]),
    );
    expect(participations).toHaveLength(3);

    const requirements = await testDb
      .select({
        shiftId: slotRequirement.shiftId,
        roleId: slotRequirement.roleId,
        requiredCount: slotRequirement.requiredCount,
        teamId: slotRequirement.teamId,
      })
      .from(slotRequirement)
      .where(eq(slotRequirement.churchId, journey.church.id));
    expect(requirements).toEqual(
      expect.arrayContaining([
        {
          shiftId: service.shiftId,
          roleId: worship.roles.usher.id,
          requiredCount: 2,
          teamId: null,
        },
        {
          shiftId: teamService.shiftId,
          roleId: worship.roles.greeter.id,
          requiredCount: 1,
          teamId: worship.teams.alpha.id,
        },
        {
          shiftId: teamService.shiftId,
          roleId: worship.roles.usher.id,
          requiredCount: 1,
          teamId: null,
        },
        {
          shiftId: rosteredService.shiftId,
          roleId: worship.roles.host.id,
          requiredCount: 3,
          teamId: null,
        },
      ]),
    );
    expect(requirements).toHaveLength(4);
  });

  it('qualifies disjoint Usher, Greeter and Host pools, and not the leader', async () => {
    const journey = await loadBoard({ anchor: ANCHOR });
    const { worship } = journey.ministries;
    const pool = Object.entries(journey.pool);

    const ushers: string[] = [];
    const greeters: string[] = [];
    const hosts: string[] = [];
    for (const [key, volunteer] of pool) {
      const roles = await qualifiedRoleIds({
        volunteerId: volunteer.volunteerId,
      });
      if (key.startsWith('usher')) {
        expect(roles).toEqual([worship.roles.usher.id]);
        ushers.push(volunteer.volunteerId);
      } else if (key.startsWith('greeter')) {
        expect(roles).toEqual([worship.roles.greeter.id]);
        greeters.push(volunteer.volunteerId);
      } else {
        expect(roles).toEqual([worship.roles.host.id]);
        hosts.push(volunteer.volunteerId);
      }
    }
    expect(ushers).toHaveLength(6);
    expect(greeters).toHaveLength(6);
    expect(hosts).toHaveLength(3);
    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.leader.volunteerId,
      }),
    ).toEqual([]);
    expect(await teamMembers({ teamId: worship.teams.alpha.id })).toEqual(
      greeters.sort(),
    );
  });

  it('seeds the rostered service with a pending, a confirmed and a declined Host', async () => {
    const journey = await loadBoard({ anchor: ANCHOR });
    const { rosteredService } = journey.events;
    const { pool } = journey;

    expect(rosteredService.day).toBe('2026-03-28');
    expect(rosteredService.requirements.host).toMatchObject({
      roleId: journey.ministries.worship.roles.host.id,
      requiredCount: 3,
    });
    const rows = await testDb
      .select({
        id: assignment.id,
        volunteerId: assignment.volunteerId,
        status: assignment.status,
        shiftId: assignment.shiftId,
      })
      .from(assignment)
      .where(eq(assignment.churchId, journey.church.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: rosteredService.assignments[0]?.id,
          volunteerId: pool.hostPending.volunteerId,
          status: 'pending',
          shiftId: rosteredService.shiftId,
        },
        {
          id: rosteredService.assignments[1]?.id,
          volunteerId: pool.hostConfirmed.volunteerId,
          status: 'confirmed',
          shiftId: rosteredService.shiftId,
        },
        {
          id: rosteredService.assignments[2]?.id,
          volunteerId: pool.hostDeclined.volunteerId,
          status: 'declined',
          shiftId: rosteredService.shiftId,
        },
      ]),
    );
    // The seats smoke and builder-slot-focus fill start empty.
    expect(rows).toHaveLength(3);
  });

  it('crosses the year boundary from a late-December anchor', async () => {
    const journey = await loadBoard({ anchor: YEAR_END_ANCHOR });
    const { service, teamService } = journey.events;

    expect(service.day).toBe('2027-01-04');
    expect(teamService.day).toBe('2027-01-07');
    const [cycle] = await testDb
      .select()
      .from(planningCycle)
      .where(eq(planningCycle.id, journey.cycle.id));
    expect(cycle?.startDate.toISOString()).toBe('2026-12-28T00:00:00.000Z');
    expect(cycle?.endDate.toISOString()).toBe('2027-01-25T00:00:00.000Z');
    for (const { id, day } of [service, teamService]) {
      const { eventRow, shiftRow } = await eventRows({ eventId: id });
      expect(eventRow?.start.toISOString()).toBe(`${day}T12:00:00.000Z`);
      expect(eventRow?.end.toISOString()).toBe(`${day}T14:00:00.000Z`);
      expect(shiftRow?.shift.startTime.toISOString()).toBe(
        `${day}T12:00:00.000Z`,
      );
      expect(shiftRow?.shift.endTime.toISOString()).toBe(
        `${day}T14:00:00.000Z`,
      );
    }
  });

  it('hangs every cycle, event and shift date from a late anchor', async () => {
    const journey = await loadBoard({ anchor: LATE_ANCHOR });
    const { service, teamService, rosteredService } = journey.events;

    expect(service.day).toBe('2027-03-08');
    expect(teamService.day).toBe('2027-03-11');
    expect(rosteredService.day).toBe('2027-03-14');

    const [cycle] = await testDb
      .select()
      .from(planningCycle)
      .where(eq(planningCycle.id, journey.cycle.id));
    expect(cycle?.startDate.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(cycle?.endDate.toISOString()).toBe('2027-03-29T00:00:00.000Z');

    for (const { id, day } of [service, teamService, rosteredService]) {
      const { eventRow, shiftRow } = await eventRows({ eventId: id });
      expect(eventRow?.start.toISOString()).toBe(`${day}T12:00:00.000Z`);
      expect(eventRow?.end.toISOString()).toBe(`${day}T14:00:00.000Z`);
      expect(shiftRow?.shift.startTime.toISOString()).toBe(
        `${day}T12:00:00.000Z`,
      );
      expect(shiftRow?.shift.endTime.toISOString()).toBe(
        `${day}T14:00:00.000Z`,
      );
    }
  });
});

describe('roster-qualification E2E journey recipe', () => {
  it('makes Grace the only qualified Greeter in the Team Alpha the TeamLeader leads', async () => {
    const journey = await loadQualification({ anchor: ANCHOR });
    const { worship } = journey.ministries;
    const { grace, ada, ursula } = journey.pool;

    expect(await qualifiedRoleIds({ volunteerId: grace.volunteerId })).toEqual(
      [worship.roles.usher.id, worship.roles.greeter.id].sort(),
    );
    expect(await qualifiedRoleIds({ volunteerId: ada.volunteerId })).toEqual(
      [worship.roles.usher.id, worship.roles.greeter.id].sort(),
    );
    expect(await qualifiedRoleIds({ volunteerId: ursula.volunteerId })).toEqual(
      [],
    );
    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.teamLeader.volunteerId,
      }),
    ).toEqual([worship.roles.usher.id]);

    expect(await teamMembers({ teamId: worship.teams.alpha.id })).toEqual(
      [
        grace.volunteerId,
        ursula.volunteerId,
        journey.personas.teamLeader.volunteerId,
      ].sort(),
    );
    const [leadership] = await testDb
      .select({ accessLevel: ministryVolunteerTeam.accessLevel })
      .from(ministryVolunteerTeam)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, ministryVolunteerTeam.ministryVolunteerId),
      )
      .where(
        eq(
          ministryVolunteer.volunteerId,
          journey.personas.teamLeader.volunteerId,
        ),
      );
    expect(leadership?.accessLevel).toBe('leader');
    expect(
      await teamMembers({ teamId: journey.ministries.care.teams.care.id }),
    ).toEqual([]);
  });

  it('starts its future Event draft and availability-fired, dated from the anchor', async () => {
    const journey = await loadQualification({ anchor: LATE_ANCHOR });
    const { eventRow, shiftRow } = await eventRows({
      eventId: journey.event.id,
    });

    expect(journey.event.day).toBe('2027-03-11');
    expect(eventRow?.status).toBe('draft');
    expect(eventRow?.start.toISOString()).toBe('2027-03-11T12:00:00.000Z');
    expect(shiftRow?.ministry_participation.state).toBe('availability_fired');
    expect(shiftRow?.shift.startTime.toISOString()).toBe(
      '2027-03-11T12:00:00.000Z',
    );
    expect(journey.event.requirements.greeter.teamId).toBe(
      journey.ministries.worship.teams.alpha.id,
    );
    expect(journey.event.requirements.usher.teamId).toBeNull();
  });
});
