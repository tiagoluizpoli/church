import {
  type CalendarDay,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
  toInstant,
} from '@church/time';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchedulingNotificationFacts } from '@/application/scheduling-notification-facts';
import {
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzlePublicEventRepository } from '@/infrastructure/repositories/drizzle-public-event.repository';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import { buildConfirmedAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import { buildVolunteerWithMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRole,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

/**
 * Pins what every surface shows or counts for a cancelled Event and for a
 * cancelled EventTimeBlock inside a live Event (#1123): the one Sent Cycle
 * below, read through each surface's use case or repository.
 */

const db = schedulingTestDb;
const TIME_ZONE = 'America/Sao_Paulo';
const OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';

interface OnInput {
  day: string;
  time: string;
}

const on = ({ day, time }: OnInput) =>
  toInstant({
    day: parseCalendarDay({ value: day }),
    time: parseTimeOfDay({ value: time }),
    timeZone: TIME_ZONE,
  });

const calendarDay = (value: string): CalendarDay => parseCalendarDay({ value });

interface StaffedShiftInput {
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  day: string;
  start: string;
  end: string;
  roleId: string;
  sectorId: string;
  peopleNeeded: number | null;
}

async function staffedShift({
  churchId,
  participationId,
  eventTimeBlockId,
  day,
  start,
  end,
  roleId,
  sectorId,
  peopleNeeded,
}: StaffedShiftInput) {
  const shift = await buildShift({
    db,
    churchId,
    participationId,
    eventTimeBlockId,
    start: on({ day, time: start }),
    end: on({ day, time: end }),
  });
  const requirement =
    peopleNeeded === null
      ? null
      : await buildShiftRequirement({
          db,
          churchId,
          participationId,
          shiftId: shift.id,
          roleId,
          sectorId,
          peopleNeeded,
        });
  return { shift, requirement };
}

/**
 * One Sent October Cycle:
 * - Retreat (Sat 17, 09–10), a cancelled Event whose one public block stays active.
 * - Sunday (Sun 18, 18–21), live: Live block 18–19 and a cancelled block 19–21, both public.
 * - Vigil (Mon 19, 19–20), live, whose only public block is cancelled.
 * Ministry A is published on Retreat and Sunday (every block), Ana assigned on
 * each staffed Shift: cancelled on the cancelled work, pending on the Live
 * block. The cancelled block also holds a Shift with no headcount. Kids opted
 * only into Sunday's cancelled block and has asked for availability.
 */
async function seedLiveBlockCycle() {
  const base = await seedSchedulingPhase3Base();
  const churchId = base.churchAId;
  const ministryId = base.ministryAId;
  const cycle = await buildCycle({
    db,
    churchId,
    name: 'October',
    state: 'sent',
    startDate: calendarDay('2026-10-12'),
    endDate: calendarDay('2026-10-25'),
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const sector = await buildSector({ db, churchId, ministryId, name: 'Room' });
  const ana = await buildVolunteerWithMembership({
    db,
    churchId,
    ministryId,
    name: 'Ana',
    email: 'ana@test.com',
    roleIds: [role.id],
  });

  const retreat = await buildEvent({
    db,
    churchId,
    cycleId: cycle.id,
    title: 'Retreat',
    start: on({ day: '2026-10-17', time: '09:00' }),
    end: on({ day: '2026-10-17', time: '10:00' }),
    status: 'cancelled',
  });
  const retreatBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: retreat.id,
    start: on({ day: '2026-10-17', time: '09:00' }),
    end: on({ day: '2026-10-17', time: '10:00' }),
    label: 'Retreat block',
    isPublic: true,
  });
  const sunday = await buildEvent({
    db,
    churchId,
    cycleId: cycle.id,
    title: 'Sunday',
    start: on({ day: '2026-10-18', time: '18:00' }),
    end: on({ day: '2026-10-18', time: '21:00' }),
    status: 'scheduled',
  });
  const liveBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: on({ day: '2026-10-18', time: '18:00' }),
    end: on({ day: '2026-10-18', time: '19:00' }),
    label: 'Live block',
    isPublic: true,
  });
  const cancelledBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: on({ day: '2026-10-18', time: '19:00' }),
    end: on({ day: '2026-10-18', time: '21:00' }),
    label: 'Cancelled block',
    isPublic: true,
    status: 'cancelled',
  });
  const vigil = await buildEvent({
    db,
    churchId,
    cycleId: cycle.id,
    title: 'Vigil',
    start: on({ day: '2026-10-19', time: '19:00' }),
    end: on({ day: '2026-10-19', time: '20:00' }),
    status: 'scheduled',
  });
  const vigilBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: vigil.id,
    start: on({ day: '2026-10-19', time: '19:00' }),
    end: on({ day: '2026-10-19', time: '20:00' }),
    label: 'Vigil block',
    isPublic: true,
    status: 'cancelled',
  });

  const retreatParticipation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: retreat.id,
    state: 'published',
    eventTimeBlockIds: [retreatBlock.id],
  });
  const sundayParticipation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: sunday.id,
    state: 'published',
    eventTimeBlockIds: [liveBlock.id, cancelledBlock.id],
  });
  const staff = { churchId, roleId: role.id, sectorId: sector.id };
  const retreatShift = await staffedShift({
    ...staff,
    participationId: retreatParticipation.id,
    eventTimeBlockId: retreatBlock.id,
    day: '2026-10-17',
    start: '09:00',
    end: '10:00',
    peopleNeeded: 2,
  });
  const liveShift = await staffedShift({
    ...staff,
    participationId: sundayParticipation.id,
    eventTimeBlockId: liveBlock.id,
    day: '2026-10-18',
    start: '18:00',
    end: '19:00',
    peopleNeeded: 2,
  });
  const cancelledShift = await staffedShift({
    ...staff,
    participationId: sundayParticipation.id,
    eventTimeBlockId: cancelledBlock.id,
    day: '2026-10-18',
    start: '19:00',
    end: '20:00',
    peopleNeeded: 2,
  });
  await staffedShift({
    ...staff,
    participationId: sundayParticipation.id,
    eventTimeBlockId: cancelledBlock.id,
    day: '2026-10-18',
    start: '20:00',
    end: '21:00',
    peopleNeeded: null,
  });
  for (const [placed, status] of [
    [retreatShift, 'cancelled'],
    [liveShift, 'pending'],
    [cancelledShift, 'cancelled'],
  ] as const) {
    await buildAssignment({
      db,
      churchId,
      participationId: placed.shift.participationId,
      shiftId: placed.shift.id,
      volunteerId: ana.volunteer.id,
      roleId: role.id,
      shiftRequirementId: placed.requirement?.id as string,
      status,
    });
  }
  const anaCheck = await buildConfirmedAvailabilityCheck({
    db,
    churchId,
    cycleId: cycle.id,
    ministryMembershipId: ana.membership.id,
    id: '55555555-5555-4555-8555-555555555501',
    confirmedAt: parseInstant({ value: '2026-10-01T12:00:00.000Z' }),
  });

  const kids = await buildMinistry({
    db,
    churchId,
    id: '66666666-6666-4666-8666-666666666601',
    name: 'Kids',
  });
  const kidsRole = await seedRole({
    churchId,
    ministryId: kids.id,
    name: 'Helper',
  });
  const kidsSector = await buildSector({
    db,
    churchId,
    ministryId: kids.id,
    name: 'Nursery',
  });
  const kidsParticipation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: kids.id,
    eventId: sunday.id,
    state: 'availability_requested',
    eventTimeBlockIds: [cancelledBlock.id],
  });
  await staffedShift({
    churchId,
    roleId: kidsRole.id,
    sectorId: kidsSector.id,
    participationId: kidsParticipation.id,
    eventTimeBlockId: cancelledBlock.id,
    day: '2026-10-18',
    start: '19:00',
    end: '21:00',
    peopleNeeded: 1,
  });

  return {
    base,
    churchId: ChurchId.from(churchId),
    ministryId: MinistryId.from(ministryId),
    kidsId: MinistryId.from(kids.id),
    cycleId: CycleId.from(cycle.id),
    ana,
    anaCheckId: AvailabilityCheckId.from(anaCheck.id),
    ids: {
      retreat: retreat.id,
      sunday: sunday.id,
      vigil: vigil.id,
      retreatBlock: retreatBlock.id,
      liveBlock: liveBlock.id,
      cancelledBlock: cancelledBlock.id,
      vigilBlock: vigilBlock.id,
    },
  };
}

type Seeded = Awaited<ReturnType<typeof seedLiveBlockCycle>>;

const participationRepo = new DrizzleMinistryParticipationRepository({ db });
const availabilityCheckRepo = new DrizzleAvailabilityCheckRepository({ db });
const planningEventRepo = new DrizzlePlanningEventRepository({ db });
const cycleRepo = new DrizzleCycleRepository({ db });
const publicEventRepo = new DrizzlePublicEventRepository({ db });

let seeded: Seeded;
/** Names an id of the seed, so a pinned value reads as the block it is. */
let nameOf: (id: string) => string;

beforeEach(async () => {
  setTestClock({ instant: parseInstant({ value: OCTOBER_1_NOON }) });
  await resetSchedulingPhase3Db();
  seeded = await seedLiveBlockCycle();
  const names = new Map<string, string>(
    Object.entries(seeded.ids).map(([name, id]) => [id, name]),
  );
  names.set(seeded.ministryId, 'ministryA');
  names.set(seeded.kidsId, 'kids');
  names.set(seeded.cycleId, 'october');
  nameOf = (id) => names.get(id) ?? id;
});

afterEach(() => {
  resetClock();
});

const NO_STAGE_COUNTS = {
  // biome-ignore lint/style/useNamingConvention: stage names are the wire keys
  to_prepare: 0,
  asking: 0,
  assigning: 0,
  published: 0,
  // biome-ignore lint/style/useNamingConvention: stage names are the wire keys
  not_serving: 0,
};

describe('Schedules list: stages, counts, gaps and needs attention', () => {
  it('counts Kids, opted only into the cancelled block, as not serving', async () => {
    const { churchId } = seeded;

    const counts = await participationRepo.countCurrentSchedulesByStage({
      churchId,
    });

    expect(counts).toEqual([
      { stage: 'not_serving', count: 1 },
      { stage: 'published', count: 1 },
    ]);
  });

  it('lists each Schedule with its stage and its gaps on live blocks only', async () => {
    const { churchId } = seeded;
    const { participationModules } = createSchedulingManagers();

    const page = await participationModules.scheduleReadModel.listSchedules({
      churchId,
      filters: { period: 'current' },
      limit: 20,
    });
    const needingAttention =
      await participationModules.scheduleReadModel.listSchedules({
        churchId,
        filters: { period: 'current', attention: true },
        limit: 20,
      });

    const brief = ({
      ministry,
      stage,
      gapCount,
    }: (typeof page.schedules)[0]) => ({
      ministry: nameOf(ministry.id),
      stage,
      gapCount,
    });
    expect(page.schedules.map(brief)).toEqual([
      { ministry: 'ministryA', stage: 'published', gapCount: 1 },
      { ministry: 'kids', stage: 'not_serving', gapCount: 0 },
    ]);
    expect(page.counts).toEqual({
      ...NO_STAGE_COUNTS,
      published: 1,
      // biome-ignore lint/style/useNamingConvention: stage names are the wire keys
      not_serving: 1,
    });
    expect(needingAttention.schedules.map(brief)).toEqual([]);
  });

  it('counts the gaps of live blocks only', async () => {
    const { churchId, ministryId, kidsId, cycleId } = seeded;

    const gaps = await participationRepo.countScheduleGaps({
      churchId,
      ministryIds: [ministryId, kidsId],
      cycleIds: [cycleId],
    });

    expect(
      gaps.map((row) => ({ ...row, ministryId: nameOf(row.ministryId) })),
    ).toEqual([{ ministryId: 'ministryA', cycleId, count: 1 }]);
  });

  it('reads the serving states of Kids on its cancelled block too', async () => {
    const { churchId, ministryId, kidsId, cycleId } = seeded;

    const rows = await participationRepo.listScheduleServingStates({
      churchId,
      ministryIds: [ministryId, kidsId],
      cycleIds: [cycleId],
    });

    expect(
      rows.map((row) => ({
        ministryId: nameOf(row.ministryId),
        cycleId: nameOf(row.cycleId),
        state: row.state,
      })),
    ).toEqual([
      { ministryId: 'ministryA', cycleId: 'october', state: 'published' },
      {
        ministryId: 'kids',
        cycleId: 'october',
        state: 'availability_requested',
      },
    ]);
  });

  it('joins a new Event at the stage each Ministry serves, cancelled block included', async () => {
    const { churchId, ministryId, kidsId, cycleId } = seeded;
    const added = await buildEvent({
      db,
      churchId,
      cycleId,
      title: 'Added',
      start: on({ day: '2026-10-20', time: '19:00' }),
      end: on({ day: '2026-10-20', time: '20:00' }),
      status: 'scheduled',
    });
    const eventId = EventId.from(added.id);

    await planningEventRepo.seedParticipations({ churchId, cycleId, eventId });

    const states = await Promise.all(
      [ministryId, kidsId].map(async (id) => {
        const row = await participationRepo.findByMinistryEvent({
          churchId,
          ministryId: id,
          eventId,
        });
        return row?.state;
      }),
    );
    expect(states).toEqual(['published', 'availability_requested']);
  });
});

describe('coverage and staffing', () => {
  it('measures staffing on live blocks only', async () => {
    const { churchId, cycleId } = seeded;
    const { participationModules } = createSchedulingManagers();

    const staffing = await participationRepo.listMinistryStaffing({
      churchId,
      cycleId,
    });
    const insights =
      await participationModules.scheduleReadModel.getScheduleInsights({
        churchId,
      });

    expect(
      staffing.map((row) => ({ ...row, ministryId: nameOf(row.ministryId) })),
    ).toEqual([
      {
        ministryId: 'ministryA',
        name: 'Scheduling Ministry A',
        needed: 2,
        filled: 1,
      },
    ]);
    expect(
      insights.cycles.map(({ needed, filled }) => ({ needed, filled })),
    ).toEqual([{ needed: 2, filled: 1 }]);
    expect(insights.focus?.ministries).toEqual([
      {
        ministryId: seeded.ministryId,
        name: 'Scheduling Ministry A',
        needed: 2,
        filled: 1,
      },
    ]);
  });
});

describe('Prepare', () => {
  it('flags both cancellations, asks for nobody on them and leaves them out of needs attention', async () => {
    const { churchId, cycleId, ministryId } = seeded;
    const { participationModules } = createSchedulingManagers();

    const view =
      await participationModules.prepareManager.getCycleParticipation({
        churchId,
        cycleId,
        ministryId,
      });

    expect(
      view.events.flatMap(({ event, eventTimeBlocks }) =>
        eventTimeBlocks.map((block) => ({
          event: event.title,
          block: nameOf(block.eventTimeBlock.id),
          included: block.included,
          cancelled: block.cancelled,
          answerCoverage: block.answerCoverage,
          flaggedShifts: block.shifts.filter(({ flagged }) => flagged).length,
        })),
      ),
    ).toEqual([
      {
        event: 'Retreat',
        block: 'retreatBlock',
        included: true,
        cancelled: true,
        answerCoverage: { available: 1, needed: null },
        flaggedShifts: 0,
      },
      {
        event: 'Sunday',
        block: 'liveBlock',
        included: true,
        cancelled: false,
        answerCoverage: { available: 1, needed: 2 },
        flaggedShifts: 0,
      },
      {
        event: 'Sunday',
        block: 'cancelledBlock',
        included: true,
        cancelled: true,
        answerCoverage: { available: 1, needed: null },
        flaggedShifts: 1,
      },
      {
        event: 'Vigil',
        block: 'vigilBlock',
        included: false,
        cancelled: true,
        answerCoverage: { available: 1, needed: null },
        flaggedShifts: 0,
      },
    ]);
    expect(view.totals).toEqual({ blocks: 4, needsAttention: 0 });
  });
});

describe('Schedule builder', () => {
  it('returns every block with its own status, under its Event status', async () => {
    const { churchId, cycleId, ministryId } = seeded;
    const { participationModules } = createSchedulingManagers();

    const view =
      await participationModules.scheduleBuilderReader.getCycleBuilderData({
        churchId,
        cycleId,
        ministryId,
        userId: UserId.from(seeded.base.adminUserId),
      });

    expect(
      view.events.map(({ event, participation, eventTimeBlocks }) => ({
        event: event.title,
        status: event.status,
        state: participation.state,
        blocks: eventTimeBlocks.map(({ eventTimeBlock, included, shifts }) => ({
          block: nameOf(eventTimeBlock.id),
          status: eventTimeBlock.status,
          included,
          shifts: shifts.length,
          activeAssignments: shifts
            .flatMap(({ assignments }) => assignments)
            .filter(({ assignment }) => assignment.status !== 'cancelled')
            .length,
        })),
      })),
    ).toEqual([
      {
        event: 'Retreat',
        status: 'cancelled',
        state: 'published',
        blocks: [
          {
            block: 'retreatBlock',
            status: 'active',
            included: true,
            shifts: 1,
            activeAssignments: 0,
          },
        ],
      },
      {
        event: 'Sunday',
        status: 'scheduled',
        state: 'published',
        blocks: [
          {
            block: 'liveBlock',
            status: 'active',
            included: true,
            shifts: 1,
            activeAssignments: 1,
          },
          {
            block: 'cancelledBlock',
            status: 'cancelled',
            included: true,
            shifts: 2,
            activeAssignments: 0,
          },
        ],
      },
      {
        event: 'Vigil',
        status: 'scheduled',
        state: 'preparing',
        blocks: [
          {
            block: 'vigilBlock',
            status: 'cancelled',
            included: false,
            shifts: 0,
            activeAssignments: 0,
          },
        ],
      },
    ]);
  });
});

describe('Schedule builder flag', () => {
  it('flags a block cancelled by its Event or on its own, as Prepare does', async () => {
    const { churchId, cycleId, ministryId } = seeded;
    const { participationModules } = createSchedulingManagers();

    const builder =
      await participationModules.scheduleBuilderReader.getCycleBuilderData({
        churchId,
        cycleId,
        ministryId,
        userId: UserId.from(seeded.base.adminUserId),
      });
    const prepare =
      await participationModules.prepareManager.getCycleParticipation({
        churchId,
        cycleId,
        ministryId,
      });

    const flags = (
      events: (typeof builder.events | typeof prepare.events)[number][],
    ) =>
      events.flatMap(({ eventTimeBlocks }) =>
        eventTimeBlocks.map(({ eventTimeBlock, cancelled }) => [
          nameOf(eventTimeBlock.id),
          cancelled,
        ]),
      );
    expect(flags(builder.events)).toEqual([
      ['retreatBlock', true],
      ['liveBlock', false],
      ['cancelledBlock', true],
      ['vigilBlock', true],
    ]);
    expect(flags(prepare.events)).toEqual(flags(builder.events));
  });
});

describe('availability checks', () => {
  it('asks only for the Shifts of live blocks', async () => {
    const { churchId, ministryId, cycleId, anaCheckId } = seeded;
    const scope = { churchId, ministryId, cycleId };

    const served = await availabilityCheckRepo.listServedShifts(scope);
    const eligible = await availabilityCheckRepo.listEligibleMemberships(scope);
    const checkShifts = await availabilityCheckRepo.listCheckShifts({
      churchId,
      checkId: anaCheckId,
      heldRolesOnly: true,
    });

    expect(
      served.map((row) => ({
        eventId: nameOf(row.eventId),
        eventTimeBlockId: nameOf(row.eventTimeBlockId),
        flagged: row.flagged,
      })),
    ).toEqual([
      { eventId: 'sunday', eventTimeBlockId: 'liveBlock', flagged: false },
    ]);
    expect(eligible.map(({ volunteerName }) => volunteerName)).toEqual(['Ana']);
    expect(
      checkShifts.map((row) => ({
        eventTitle: row.eventTitle,
        startTime: row.startTime,
        published: row.published,
        assigned: row.assigned,
      })),
    ).toEqual([
      {
        eventTitle: 'Sunday',
        startTime: on({ day: '2026-10-18', time: '18:00' }),
        published: true,
        assigned: true,
      },
    ]);
  });

  it("shows the Volunteer's check with the live Shift only", async () => {
    const { churchId, anaCheckId } = seeded;
    const { volunteerManager } = createSchedulingManagers();

    const check = await volunteerManager.getAvailabilityCheck({
      churchId,
      volunteerId: VolunteerId.from(seeded.ana.volunteer.id),
      checkId: anaCheckId,
    });

    expect(
      check.days.map(({ date, state, shifts }) => ({
        date,
        state,
        shifts: shifts.map(({ eventTitle, startTime }) => ({
          eventTitle,
          startTime,
        })),
      })),
    ).toEqual([
      {
        date: '2026-10-18',
        state: 'published',
        shifts: [
          {
            eventTitle: 'Sunday',
            startTime: on({ day: '2026-10-18', time: '18:00' }),
          },
        ],
      },
    ]);
    expect(check.counts).toEqual({
      openDays: 0,
      pastDays: 0,
      publishedDays: 1,
      openShifts: 0,
    });
  });
});

describe('Volunteer views', () => {
  it('shows only the live Assignment on My schedule, the dashboard and the Ministry Schedule', async () => {
    const { churchId, ministryId, cycleId } = seeded;
    const { volunteerManager } = createSchedulingManagers();
    const volunteerId = VolunteerId.from(seeded.ana.volunteer.id);
    const liveStart = on({ day: '2026-10-18', time: '18:00' });

    const published = await volunteerManager.getPublishedSchedule({
      churchId,
      volunteerId,
    });
    const dashboard = await volunteerManager.getDashboard({
      churchId,
      volunteerId,
      userId: UserId.from(seeded.ana.user.id),
    });
    const ministrySchedule = await volunteerManager.getMinistrySchedule({
      churchId,
      volunteerId,
      ministryId,
      cycleId,
    });

    expect(
      published.assignments.map(({ eventTitle, startTime, status }) => ({
        eventTitle,
        startTime,
        status,
      })),
    ).toEqual([
      { eventTitle: 'Sunday', startTime: liveStart, status: 'pending' },
    ]);
    expect(published.counts).toEqual({
      upcoming: 1,
      thisMonth: 1,
      openSwaps: 0,
    });
    expect(
      dashboard.upcomingAssignmentGroups.map(({ eventTitle, assignments }) => ({
        eventTitle,
        blocks: assignments.map(({ eventTimeBlockId }) =>
          nameOf(eventTimeBlockId),
        ),
      })),
    ).toEqual([{ eventTitle: 'Sunday', blocks: ['liveBlock'] }]);
    expect(dashboard.nextAssignment?.eventTitle).toBe('Sunday');
    expect(
      ministrySchedule.events.map(({ title, assignmentCount, rows }) => ({
        title,
        assignmentCount,
        rows: rows.map(({ shiftStart, volunteerDisplayName }) => ({
          shiftStart,
          volunteerDisplayName,
        })),
      })),
    ).toEqual([
      {
        title: 'Sunday',
        assignmentCount: 1,
        rows: [
          { shiftStart: liveStart, volunteerDisplayName: 'Ana' },
          { shiftStart: liveStart, volunteerDisplayName: undefined },
        ],
      },
    ]);
  });
});

describe('notification facts and Cycle counts', () => {
  it('counts the Events not cancelled, an Event whose blocks are all cancelled included', async () => {
    const { churchId, ministryId, cycleId } = seeded;
    const facts = new SchedulingNotificationFacts({
      churchRepository: new DrizzleChurchRepository({ db }),
      ministryRepository: new DrizzleMinistryRepository({ db }),
      cycleRepository: cycleRepo,
      eventRepository: planningEventRepo,
      availabilityCheckRepository: availabilityCheckRepo,
      webBaseUrl: 'http://web.test',
    });

    const ready = await facts.cycleReadyToPrepare({
      churchId,
      data: {
        cycleId,
        ministryIds: [ministryId],
        churchLogoUrl: null,
        churchAccent: null,
      },
    });
    const counts = await cycleRepo.countEvents({
      churchId,
      cycleIds: [cycleId],
    });

    expect(ready?.eventCount).toBe(2);
    expect(counts).toEqual({ [cycleId]: 2 });
  });
});

describe('Planning calendar', () => {
  it("reads each Event's and each block's own status", async () => {
    const { churchId, cycleId } = seeded;

    const events = await planningEventRepo.listCycleEvents({
      churchId,
      cycleId,
    });

    expect(
      events.map(({ event, eventTimeBlocks }) => ({
        event: event.title,
        status: event.status,
        blocks: eventTimeBlocks.map(({ id, status }) => ({
          block: nameOf(id),
          status,
        })),
      })),
    ).toEqual([
      {
        event: 'Retreat',
        status: 'cancelled',
        blocks: [{ block: 'retreatBlock', status: 'active' }],
      },
      {
        event: 'Sunday',
        status: 'scheduled',
        blocks: [
          { block: 'liveBlock', status: 'active' },
          { block: 'cancelledBlock', status: 'cancelled' },
        ],
      },
      {
        event: 'Vigil',
        status: 'scheduled',
        blocks: [{ block: 'vigilBlock', status: 'cancelled' }],
      },
    ]);
  });
});

describe('Public Church Profile', () => {
  it('shows an Event as cancelled when it, or every public block in it, is', async () => {
    const { churchId } = seeded;

    const page = await publicEventRepo.listPublicEvents({
      churchId,
      now: parseInstant({ value: OCTOBER_1_NOON }),
      limit: 10,
    });

    expect(
      page.items.map(({ title, cancelled, blocks }) => ({
        title,
        cancelled,
        blocks: blocks.map((block) => [block.label, block.cancelled]),
      })),
    ).toEqual([
      { title: 'Retreat', cancelled: true, blocks: [['Retreat block', true]] },
      {
        title: 'Sunday',
        cancelled: false,
        blocks: [
          ['Live block', false],
          ['Cancelled block', true],
        ],
      },
      { title: 'Vigil', cancelled: true, blocks: [['Vigil block', true]] },
    ]);
    expect(page.nextCursor).toBeNull();
  });
});
