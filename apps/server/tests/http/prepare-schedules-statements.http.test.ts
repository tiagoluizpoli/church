import { appConfig } from '@church/app-config';
import { scheduleLastTold } from '@church/db';
import { parseInstant } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import type { AssignmentStatus } from '@/domain/entities/assignment';
import type { ParticipationState } from '@/domain/entities/ministry-participation';
import type { ScheduleAssignmentSnapshot } from '@/domain/schedule-last-told';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { compareStatementCounts } from '@/tests/test-support/statement-count';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));

const { auth: mockAuth } = await import('@/main/di/server-auth');
const mockGetSession = vi.mocked(mockAuth.api.getSession);
const mockSetActiveOrganization = vi.mocked(mockAuth.api.setActiveOrganization);

const db = schedulingTestDb;

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  // Real managers, repositories, resolver and AuthorityService: only the
  // Better Auth session is a seam.
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new PrepareController({
    config: appConfig,
    ...createSchedulingManagers().participationModules,
    availabilityCheckManager: {} as never,
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: new DrizzleMinistryRepository({ db }),
      }),
    }),
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  mockSetActiveOrganization.mockResolvedValue(null as never);
  await resetSchedulingPhase3Db();
});

/** The seeded ChurchAdmin, who also leads Scheduling Ministry A. */
function signInAdmin(churchId: string) {
  mockGetSession.mockResolvedValue({
    user: { id: 'sched-admin-user' },
    session: { activeOrganizationId: churchId },
  } as never);
}

interface SeedScheduleEventInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  state: ParticipationState;
  title: string;
  day: string;
  eventStatus?: 'scheduled' | 'cancelled';
  blockStatus?: 'active' | 'cancelled';
}

/** One Event with one block the Ministry serves, a Shift and a one-place Usher requirement. */
async function seedScheduleEvent({
  churchId,
  cycleId,
  ministryId,
  state,
  title,
  day,
  eventStatus = 'scheduled',
  blockStatus = 'active',
}: SeedScheduleEventInput) {
  const start = parseInstant({ value: `${day}T12:00:00.000Z` });
  const end = parseInstant({ value: `${day}T14:00:00.000Z` });
  const planningEvent = await buildEvent({
    db,
    churchId,
    cycleId,
    title,
    start,
    end,
    status: eventStatus,
  });
  const block = await buildEventTimeBlock({
    db,
    churchId,
    eventId: planningEvent.id,
    start,
    end,
    status: blockStatus,
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: planningEvent.id,
    state,
    eventTimeBlockIds: [block.id],
  });
  return { planningEvent, block, participation };
}

interface SeedShiftWithRequirementInput {
  churchId: string;
  ministryId: string;
  participationId: string;
  eventTimeBlockId: string;
  day: string;
  label: string;
}

async function seedShiftWithRequirement({
  churchId,
  ministryId,
  participationId,
  eventTimeBlockId,
  day,
  label,
}: SeedShiftWithRequirementInput) {
  const shift = await seedShift({
    churchId,
    participationId,
    eventTimeBlockId,
    startTime: new Date(`${day}T12:00:00.000Z`),
    endTime: new Date(`${day}T14:00:00.000Z`),
    label,
  });
  const role = await seedRole({ churchId, ministryId, name: `Usher ${label}` });
  const requirement = await seedRequirement({
    churchId,
    participationId,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 1,
  });
  return { shift, role, requirement };
}

type SeededShiftWithRequirement = Awaited<
  ReturnType<typeof seedShiftWithRequirement>
>;

interface AssignVolunteerInput {
  churchId: string;
  ministryId: string;
  participationId: string;
  place: SeededShiftWithRequirement;
  name: string;
  status?: AssignmentStatus;
}

async function assignVolunteer({
  churchId,
  ministryId,
  participationId,
  place,
  name,
  status = 'pending',
}: AssignVolunteerInput) {
  const { volunteer } = await seedVolunteerMembership({
    churchId,
    ministryId,
    name,
    email: `${name.toLowerCase().replaceAll(' ', '-')}@test.com`,
  });
  const assigned = await buildAssignment({
    db,
    churchId,
    participationId,
    shiftId: place.shift.id,
    roleId: place.role.id,
    shiftRequirementId: place.requirement.id,
    volunteerId: volunteer.id,
    status,
  });
  return { volunteer, assigned };
}

interface SeedPublishedScheduleInput {
  churchId: string;
  cycleId: string;
  name: string;
}

/** A published Schedule of a new Ministry: one Event, one Shift, one Volunteer not yet told. */
async function seedPublishedSchedule({
  churchId,
  cycleId,
  name,
}: SeedPublishedScheduleInput) {
  const ministry = await buildMinistry({ db, churchId, name });
  const day = '2099-10-04';
  const { block, participation } = await seedScheduleEvent({
    churchId,
    cycleId,
    ministryId: ministry.id,
    state: 'published',
    title: `${name} service`,
    day,
  });
  const place = await seedShiftWithRequirement({
    churchId,
    ministryId: ministry.id,
    participationId: participation.id,
    eventTimeBlockId: block.id,
    day,
    label: name,
  });
  await assignVolunteer({
    churchId,
    ministryId: ministry.id,
    participationId: participation.id,
    place,
    name: `${name} Volunteer`,
  });
  return { ministry, block, participation, place };
}

async function seedSentCycle(churchId: string) {
  return createSchedulingPhase3Cycle({
    churchId,
    name: 'October 2099',
    startDate: new Date('2099-10-01T00:00:00.000Z'),
    endDate: new Date('2099-10-31T00:00:00.000Z'),
    state: 'sent',
  });
}

function scheduleRequests(ministryId: string, cycleId: string) {
  return [
    { method: 'GET', url: '/api/v1/prepare/schedules' },
    { method: 'GET', url: '/api/v1/prepare/schedules?attention=true' },
    {
      method: 'GET',
      url: `/api/v1/prepare/schedules/${ministryId}/${cycleId}`,
    },
    { method: 'GET', url: '/api/v1/prepare/insights' },
  ] as const;
}

describe('Schedules list, single Schedule and insights statement budgets', () => {
  it('pins the statements for one published Schedule and for six sharing its Cycle', async () => {
    const { churchAId: churchId } = await seedSchedulingPhase3Base();
    signInAdmin(churchId);
    const cycle = await seedSentCycle(churchId);
    const first = await seedPublishedSchedule({
      churchId,
      cycleId: cycle.id,
      name: 'Alpha',
    });

    const { small, large } = await compareStatementCounts({
      app,
      requests: scheduleRequests(first.ministry.id, cycle.id),
      grow: async () => {
        for (const name of ['Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'])
          await seedPublishedSchedule({ churchId, cycleId: cycle.id, name });
      },
    });

    for (const { response } of [...small, ...large])
      expect(response.statusCode).toBe(200);
    const published = (body: string) =>
      (
        JSON.parse(body) as {
          schedules: { stage: string; affectedVolunteerCount: number }[];
        }
      ).schedules
        .filter(({ stage }) => stage === 'published')
        .map(({ affectedVolunteerCount }) => affectedVolunteerCount);
    expect(published(small[0]?.response.body ?? '')).toEqual([1]);
    expect(published(large[0]?.response.body ?? '')).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    expect(small[2]?.response.json().affectedVolunteerCount).toBe(1);
    expect(large[2]?.response.json().affectedVolunteerCount).toBe(1);
    expect(small.map(({ statements }) => statements)).toEqual([33, 12, 25, 13]);
    expect(large.map(({ statements }) => statements)).toEqual([
      193, 12, 40, 13,
    ]);
  });

  it('pins the statements for a small and a large Assignment history', async () => {
    const { churchAId: churchId } = await seedSchedulingPhase3Base();
    signInAdmin(churchId);
    const cycle = await seedSentCycle(churchId);
    const schedule = await seedPublishedSchedule({
      churchId,
      cycleId: cycle.id,
      name: 'Alpha',
    });

    const { small, large } = await compareStatementCounts({
      app,
      requests: scheduleRequests(schedule.ministry.id, cycle.id),
      grow: async () => {
        // More Shifts of the block, half their Assignments cancelled since.
        for (let index = 0; index < 8; index++) {
          const place = await seedShiftWithRequirement({
            churchId,
            ministryId: schedule.ministry.id,
            participationId: schedule.participation.id,
            eventTimeBlockId: schedule.block.id,
            day: '2099-10-04',
            label: `History ${index}`,
          });
          await assignVolunteer({
            churchId,
            ministryId: schedule.ministry.id,
            participationId: schedule.participation.id,
            place,
            name: `History ${index}`,
            status: index % 2 === 0 ? 'pending' : 'cancelled',
          });
        }
      },
    });

    for (const { response } of [...small, ...large])
      expect(response.statusCode).toBe(200);
    expect(small[2]?.response.json().affectedVolunteerCount).toBe(1);
    expect(large[2]?.response.json().affectedVolunteerCount).toBe(5);
    expect(small.map(({ statements }) => statements)).toEqual([33, 12, 25, 13]);
    expect(large.map(({ statements }) => statements)).toEqual([37, 12, 29, 13]);
  });

  it('pins the statements of an unpublished Schedule, however many Events its Cycle holds', async () => {
    const { churchAId: churchId, ministryAId } =
      await seedSchedulingPhase3Base();
    signInAdmin(churchId);
    const cycle = await seedSentCycle(churchId);
    const seedAssigningEvent = async (title: string) => {
      const { block, participation } = await seedScheduleEvent({
        churchId,
        cycleId: cycle.id,
        ministryId: ministryAId,
        state: 'assigning',
        title,
        day: '2099-10-11',
      });
      const place = await seedShiftWithRequirement({
        churchId,
        ministryId: ministryAId,
        participationId: participation.id,
        eventTimeBlockId: block.id,
        day: '2099-10-11',
        label: title,
      });
      await assignVolunteer({
        churchId,
        ministryId: ministryAId,
        participationId: participation.id,
        place,
        name: `${title} Volunteer`,
      });
    };
    await seedAssigningEvent('First');

    const { small, large } = await compareStatementCounts({
      app,
      requests: scheduleRequests(ministryAId, cycle.id).slice(0, 3),
      grow: async () => {
        for (const title of ['Second', 'Third', 'Fourth', 'Fifth'])
          await seedAssigningEvent(title);
      },
    });

    for (const { response } of [...small, ...large])
      expect(response.statusCode).toBe(200);
    expect(small[2]?.response.json()).toMatchObject({
      stage: 'assigning',
      affectedVolunteerCount: 0,
    });
    expect(small.map(({ statements }) => statements)).toEqual([22, 22, 20]);
    expect(large.map(({ statements }) => statements)).toEqual([34, 34, 32]);
  });
});

describe('affectedVolunteerCount on the Schedules list and the single Schedule', () => {
  interface SnapshotInput {
    place: SeededShiftWithRequirement;
    eventId: string;
    assignmentId: string;
    day: string;
  }

  function snapshot({
    place,
    eventId,
    assignmentId,
    day,
  }: SnapshotInput): ScheduleAssignmentSnapshot {
    return {
      assignmentId,
      shiftId: place.shift.id,
      eventId,
      eventTitle: 'Told service',
      eventStart: `${day}T12:00:00.000Z`,
      eventEnd: `${day}T14:00:00.000Z`,
      startsAt: `${day}T12:00:00.000Z`,
      endsAt: `${day}T14:00:00.000Z`,
      roleId: place.role.id,
      roleName: place.role.name,
      sectorId: place.requirement.sectorId,
      sectorName: 'Geral',
    } as ScheduleAssignmentSnapshot;
  }

  /**
   * Published Alpha in October 2099. Live Event with a live block (Ana added,
   * Bia told and unchanged, Caio told and since cancelled) and a cancelled
   * block (Duda added, Edu told). A cancelled Event (Fabi added).
   * Mixed Beta: a published Event (Gil added) and an assigning one (Hugo added).
   * Assigning Gamma (Ivo added).
   */
  async function seedChanges() {
    const { churchAId: churchId } = await seedSchedulingPhase3Base();
    const cycle = await seedSentCycle(churchId);
    const day = '2099-10-04';
    const alpha = await buildMinistry({ db, churchId, name: 'Alpha' });
    const live = await seedScheduleEvent({
      churchId,
      cycleId: cycle.id,
      ministryId: alpha.id,
      state: 'published',
      title: 'Live service',
      day,
    });
    const livePlace = await seedShiftWithRequirement({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      eventTimeBlockId: live.block.id,
      day,
      label: 'Live',
    });
    await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      place: livePlace,
      name: 'Ana',
    });
    const bia = await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      place: livePlace,
      name: 'Bia',
    });
    const caio = await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      place: livePlace,
      name: 'Caio',
      status: 'cancelled',
    });
    const cancelledBlock = await buildEventTimeBlock({
      db,
      churchId,
      eventId: live.planningEvent.id,
      start: parseInstant({ value: `${day}T12:00:00.000Z` }),
      end: parseInstant({ value: `${day}T14:00:00.000Z` }),
      status: 'cancelled',
    });
    const cancelledBlockPlace = await seedShiftWithRequirement({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      eventTimeBlockId: cancelledBlock.id,
      day,
      label: 'Cancelled block',
    });
    await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      place: cancelledBlockPlace,
      name: 'Duda',
    });
    const edu = await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: live.participation.id,
      place: cancelledBlockPlace,
      name: 'Edu',
      status: 'cancelled',
    });
    const cancelledEvent = await seedScheduleEvent({
      churchId,
      cycleId: cycle.id,
      ministryId: alpha.id,
      state: 'published',
      title: 'Cancelled service',
      day,
      eventStatus: 'cancelled',
    });
    const cancelledEventPlace = await seedShiftWithRequirement({
      churchId,
      ministryId: alpha.id,
      participationId: cancelledEvent.participation.id,
      eventTimeBlockId: cancelledEvent.block.id,
      day,
      label: 'Cancelled Event',
    });
    await assignVolunteer({
      churchId,
      ministryId: alpha.id,
      participationId: cancelledEvent.participation.id,
      place: cancelledEventPlace,
      name: 'Fabi',
    });
    for (const [told, place] of [
      [bia, livePlace],
      [caio, livePlace],
      [edu, cancelledBlockPlace],
    ] as const) {
      await db.insert(scheduleLastTold).values({
        churchId,
        ministryId: alpha.id,
        cycleId: cycle.id,
        volunteerId: told.volunteer.id,
        assignments: [
          snapshot({
            place,
            eventId: live.planningEvent.id,
            assignmentId: told.assigned.id,
            day,
          }),
        ],
      });
    }

    const beta = await buildMinistry({ db, churchId, name: 'Beta' });
    for (const [state, name] of [
      ['published', 'Gil'],
      ['assigning', 'Hugo'],
    ] as const) {
      const scheduled = await seedScheduleEvent({
        churchId,
        cycleId: cycle.id,
        ministryId: beta.id,
        state,
        title: `Beta ${state}`,
        day,
      });
      const place = await seedShiftWithRequirement({
        churchId,
        ministryId: beta.id,
        participationId: scheduled.participation.id,
        eventTimeBlockId: scheduled.block.id,
        day,
        label: `Beta ${state}`,
      });
      await assignVolunteer({
        churchId,
        ministryId: beta.id,
        participationId: scheduled.participation.id,
        place: place,
        name: name,
      });
    }

    const gamma = await buildMinistry({ db, churchId, name: 'Gamma' });
    const assigning = await seedScheduleEvent({
      churchId,
      cycleId: cycle.id,
      ministryId: gamma.id,
      state: 'assigning',
      title: 'Gamma service',
      day,
    });
    const gammaPlace = await seedShiftWithRequirement({
      churchId,
      ministryId: gamma.id,
      participationId: assigning.participation.id,
      eventTimeBlockId: assigning.block.id,
      day,
      label: 'Gamma',
    });
    await assignVolunteer({
      churchId,
      ministryId: gamma.id,
      participationId: assigning.participation.id,
      place: gammaPlace,
      name: 'Ivo',
    });
    return { churchId, cycle, alpha, beta, gamma };
  }

  it('counts Volunteers with untold changes, leaving out cancelled Events and blocks, on the list and the single read', async () => {
    const { churchId, cycle, alpha, beta, gamma } = await seedChanges();
    signInAdmin(churchId);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/prepare/schedules',
    });

    expect(list.statusCode).toBe(200);
    const rows = (
      list.json() as {
        schedules: {
          ministry: { name: string };
          stage: string;
          affectedVolunteerCount: number;
        }[];
      }
    ).schedules.map(({ ministry, stage, affectedVolunteerCount }) => ({
      name: ministry.name,
      stage,
      affectedVolunteerCount,
    }));
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: 'Alpha', stage: 'published', affectedVolunteerCount: 2 },
        { name: 'Beta', stage: 'assigning', affectedVolunteerCount: 1 },
        { name: 'Gamma', stage: 'assigning', affectedVolunteerCount: 0 },
      ]),
    );
    for (const [ministry, expected] of [
      [alpha, 2],
      [beta, 1],
      [gamma, 0],
    ] as const) {
      const single = await app.inject({
        method: 'GET',
        url: `/api/v1/prepare/schedules/${ministry.id}/${cycle.id}`,
      });
      expect(single.statusCode).toBe(200);
      expect(single.json().affectedVolunteerCount).toBe(expected);
    }
  });
});
