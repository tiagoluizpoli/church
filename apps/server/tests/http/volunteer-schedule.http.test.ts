import { appConfig } from '@church/app-config';
import {
  event,
  eventTimeBlock,
  ministryParticipation,
  swapRequest,
} from '@church/db';
import type { Instant } from '@church/time';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { VolunteerScheduleController } from '@/api/controllers/volunteer-schedule-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildEventTimeBlock,
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
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_URL = '/api/v1/volunteer/schedule';
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const { volunteerManager } = createSchedulingManagers();
  const activeChurchResolver = new DbActiveChurchResolver({
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
  });
  const controllers = [
    new VolunteerScheduleController({ volunteerManager, activeChurchResolver }),
    new VolunteerController({
      volunteerManager,
      activeChurchResolver,
      config: appConfig,
    }),
  ];
  await app.register(
    async (instance) => {
      for (const controller of controllers) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      }
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
  await resetSchedulingPhase3Db();
});

function fromNow(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

interface SeedCycleInput {
  churchId: string;
  name: string;
  startOffsetMs: number;
  endOffsetMs: number;
}

async function seedCycle({
  churchId,
  name,
  startOffsetMs,
  endOffsetMs,
}: SeedCycleInput) {
  return await createSchedulingPhase3Cycle({
    churchId,
    name,
    startDate: fromNow(startOffsetMs),
    endDate: fromNow(endOffsetMs),
    state: 'sent',
  });
}

interface SeedPublishedShiftInput {
  churchId: string;
  ministryId: string;
  cycleId: string;
  title: string;
  startOffsetMs: number;
  endOffsetMs: number;
  published?: boolean;
}

async function seedShiftGraph(input: SeedPublishedShiftInput) {
  const { churchId, ministryId, cycleId, title, published = true } = input;
  const start = fromNow(input.startOffsetMs);
  const end = fromNow(input.endOffsetMs);
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    ministryId,
    cycleId,
    title,
    start,
    end,
    status: 'scheduled',
  });
  if (published) {
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, graph.participation.id));
  }
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: start,
    endTime: end,
    label: title,
  });
  return { graph, shift };
}

async function seedWorld() {
  const base = await seedSchedulingPhase3Base();
  const { churchAId: churchId, ministryAId: ministryId } = base;
  const me = await seedVolunteerMembership({
    churchId,
    ministryId,
    name: 'Maria Souza Lima',
    email: 'maria@test.com',
    ministryAccessLevel: 'volunteer',
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: me.volunteer.userId,
    accessLevel: 'member',
  });
  getSession.mockResolvedValue({
    user: { id: me.volunteer.userId },
    session: { activeOrganizationId: churchId },
  } as never);
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const assignMe = async (
    seeded: Awaited<ReturnType<typeof seedShiftGraph>>,
    status: 'confirmed' | 'pending' | 'declined' = 'confirmed',
  ) => {
    const requirement = await seedRequirement({
      churchId,
      participationId: seeded.graph.participation.id,
      shiftId: seeded.shift.id,
      roleId: role.id,
      peopleNeeded: 2,
    });
    return await buildAssignment({
      db,
      churchId,
      participationId: seeded.graph.participation.id,
      shiftId: seeded.shift.id,
      volunteerId: me.volunteer.id,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status,
    });
  };
  return { churchId, ministryId, me, role, assignMe };
}

describe('GET /volunteer/schedule (database-backed)', () => {
  it('lists published in-progress and upcoming Assignments, drops finished and unpublished ones', async () => {
    const { churchId, ministryId, assignMe } = await seedWorld();
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -5 * DAY_MS,
      endOffsetMs: 25 * DAY_MS,
    });
    const common = { churchId, ministryId, cycleId: cycle.id };
    const running = await seedShiftGraph({
      ...common,
      title: 'Running',
      startOffsetMs: -HOUR_MS,
      endOffsetMs: HOUR_MS,
    });
    const upcoming = await seedShiftGraph({
      ...common,
      title: 'Upcoming',
      startOffsetMs: 2 * DAY_MS,
      endOffsetMs: 2 * DAY_MS + HOUR_MS,
    });
    const finished = await seedShiftGraph({
      ...common,
      title: 'Finished',
      startOffsetMs: -2 * DAY_MS,
      endOffsetMs: -2 * DAY_MS + HOUR_MS,
    });
    const unpublished = await seedShiftGraph({
      ...common,
      title: 'Unpublished',
      startOffsetMs: 3 * DAY_MS,
      endOffsetMs: 3 * DAY_MS + HOUR_MS,
      published: false,
    });
    const runningAssignment = await assignMe(running);
    const upcomingAssignment = await assignMe(upcoming);
    await assignMe(finished);
    await assignMe(unpublished, 'pending');

    const response = await app.inject({ method: 'GET', url: SCHEDULE_URL });

    expect(response.statusCode).toBe(200);
    const { assignments } = response.json();
    expect(
      assignments.map((a: { assignmentId: string }) => a.assignmentId),
    ).toEqual([runningAssignment.id, upcomingAssignment.id]);
  });

  it('flags only an open request on a Shift that has not started', async () => {
    const { churchId, ministryId, me, assignMe } = await seedWorld();
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -5 * DAY_MS,
      endOffsetMs: 25 * DAY_MS,
    });
    const common = { churchId, ministryId, cycleId: cycle.id };
    const [running, requested, plain, withdrawn] = [
      await seedShiftGraph({
        ...common,
        title: 'Running',
        startOffsetMs: -HOUR_MS,
        endOffsetMs: HOUR_MS,
      }),
      await seedShiftGraph({
        ...common,
        title: 'Requested',
        startOffsetMs: 2 * DAY_MS,
        endOffsetMs: 2 * DAY_MS + HOUR_MS,
      }),
      await seedShiftGraph({
        ...common,
        title: 'Plain',
        startOffsetMs: 3 * DAY_MS,
        endOffsetMs: 3 * DAY_MS + HOUR_MS,
      }),
      await seedShiftGraph({
        ...common,
        title: 'Withdrawn',
        startOffsetMs: 4 * DAY_MS,
        endOffsetMs: 4 * DAY_MS + HOUR_MS,
      }),
    ];
    const rows = [
      [await assignMe(running), 'open'],
      [await assignMe(requested), 'open'],
      [await assignMe(plain), null],
      [await assignMe(withdrawn), 'withdrawn'],
    ] as const;
    for (const [assignment, status] of rows) {
      if (!status) continue;
      await db.insert(swapRequest).values({
        churchId,
        assignmentId: assignment.id,
        status,
        raisedBy: me.volunteer.userId,
      });
    }

    const response = await app.inject({ method: 'GET', url: SCHEDULE_URL });

    expect(
      response
        .json()
        .assignments.map(
          (a: { eventTitle: string; swapRequested: boolean }) => [
            a.eventTitle,
            a.swapRequested,
          ],
        ),
    ).toEqual([
      ['Running', false],
      ['Requested', true],
      ['Plain', false],
      ['Withdrawn', false],
    ]);
  });

  it('lists a published Schedule the caller has no Assignment in, and drops a past Cycle', async () => {
    const { churchId, ministryId } = await seedWorld();
    const current = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -5 * DAY_MS,
      endOffsetMs: 25 * DAY_MS,
    });
    const past = await seedCycle({
      churchId,
      name: 'Past',
      startOffsetMs: -40 * DAY_MS,
      endOffsetMs: -10 * DAY_MS,
    });
    await seedShiftGraph({
      churchId,
      ministryId,
      cycleId: current.id,
      title: 'Current event',
      startOffsetMs: DAY_MS,
      endOffsetMs: DAY_MS + HOUR_MS,
    });
    await seedShiftGraph({
      churchId,
      ministryId,
      cycleId: past.id,
      title: 'Past event',
      startOffsetMs: -20 * DAY_MS,
      endOffsetMs: -20 * DAY_MS + HOUR_MS,
    });

    const response = await app.inject({ method: 'GET', url: SCHEDULE_URL });

    expect(response.statusCode).toBe(200);
    expect(response.json().assignments).toEqual([]);
    expect(response.json().schedules).toEqual([
      {
        ministryId,
        ministryName: 'Scheduling Ministry A',
        cycleId: current.id,
        cycleName: 'Current',
      },
    ]);
  });

  it('is 401 without a session', async () => {
    await seedWorld();
    getSession.mockResolvedValue(null);
    const response = await app.inject({ method: 'GET', url: SCHEDULE_URL });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /volunteer/ministries/:ministryId/schedule (database-backed)', () => {
  it('is 404 for a Ministry the caller is not a member of', async () => {
    const { churchId } = await seedWorld();
    const otherMinistry = await buildMinistry({
      db,
      churchId,
      name: 'Other Ministry',
    });
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -DAY_MS,
      endOffsetMs: 20 * DAY_MS,
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${otherMinistry.id}/schedule?cycleId=${cycle.id}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('answers published:false while the Ministry has no published Schedule in the Cycle', async () => {
    const { churchId, ministryId } = await seedWorld();
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -DAY_MS,
      endOffsetMs: 20 * DAY_MS,
    });
    await seedShiftGraph({
      churchId,
      ministryId,
      cycleId: cycle.id,
      title: 'Draft',
      startOffsetMs: DAY_MS,
      endOffsetMs: DAY_MS + HOUR_MS,
      published: false,
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${ministryId}/schedule?cycleId=${cycle.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      published: false,
      cycleId: cycle.id,
      events: [],
    });
  });

  it('returns one row group per Shift when published', async () => {
    const { churchId, ministryId, assignMe } = await seedWorld();
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -DAY_MS,
      endOffsetMs: 20 * DAY_MS,
    });
    const seeded = await seedShiftGraph({
      churchId,
      ministryId,
      cycleId: cycle.id,
      title: 'Morning',
      startOffsetMs: DAY_MS,
      endOffsetMs: DAY_MS + HOUR_MS,
    });
    await assignMe(seeded);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${ministryId}/schedule?cycleId=${cycle.id}`,
    });
    expect(response.statusCode).toBe(200);
    const [event] = response.json().events;
    expect(event.rows).toHaveLength(2);
    expect(event.rows[0]).toMatchObject({
      shiftId: seeded.shift.id,
      shiftLabel: 'Morning',
      volunteerDisplayName: 'Maria L.',
    });
  });
});

describe('Volunteer reads after an admin cancellation', () => {
  /**
   * Live, a cancelled Event and a scheduled Event whose block is cancelled.
   * Cancellation cancels active Assignments; a declined one stays declined,
   * so only the Event or block status can hide it.
   */
  async function seedCancelled() {
    const world = await seedWorld();
    const { churchId, ministryId, assignMe } = world;
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -DAY_MS,
      endOffsetMs: 20 * DAY_MS,
    });
    const common = { churchId, ministryId, cycleId: cycle.id };
    const live = await seedShiftGraph({
      ...common,
      title: 'Live',
      startOffsetMs: DAY_MS,
      endOffsetMs: DAY_MS + HOUR_MS,
    });
    const cancelledEvent = await seedShiftGraph({
      ...common,
      title: 'Cancelled Event',
      startOffsetMs: 2 * DAY_MS,
      endOffsetMs: 2 * DAY_MS + HOUR_MS,
    });
    const cancelledBlock = await seedShiftGraph({
      ...common,
      title: 'Cancelled Block',
      startOffsetMs: 3 * DAY_MS,
      endOffsetMs: 3 * DAY_MS + HOUR_MS,
    });
    const liveAssignment = await assignMe(live);
    const inEvent = await assignMe(cancelledEvent, 'declined');
    const inBlock = await assignMe(cancelledBlock, 'declined');
    await db
      .update(event)
      .set({ status: 'cancelled' })
      .where(eq(event.id, cancelledEvent.graph.event.id));
    await db
      .update(eventTimeBlock)
      .set({ status: 'cancelled' })
      .where(eq(eventTimeBlock.id, cancelledBlock.graph.eventTimeBlock.id));
    return { ...world, cycle, live, liveAssignment, inEvent, inBlock };
  }

  it('drops cancelled Events and blocks from My schedule and keeps the live Assignment', async () => {
    const { liveAssignment } = await seedCancelled();

    const response = await app.inject({ method: 'GET', url: SCHEDULE_URL });

    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .assignments.map((a: { assignmentId: string }) => a.assignmentId),
    ).toEqual([liveAssignment.id]);
  });

  it('drops cancelled Events and block Shifts from the Ministry schedule', async () => {
    const { ministryId, cycle, live } = await seedCancelled();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${ministryId}/schedule?cycleId=${cycle.id}`,
    });

    expect(response.statusCode).toBe(200);
    const { published, events } = response.json();
    expect(published).toBe(true);
    // The block's Event stays (it is not cancelled), with no rows left.
    expect(
      events.map((item: { title: string; rows: { shiftId: string }[] }) => [
        item.title,
        item.rows.map(({ shiftId }) => shiftId),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['Live', [live.shift.id, live.shift.id]],
        ['Cancelled Block', []],
      ]),
    );
    expect(events).toHaveLength(2);
  });

  it('keeps the live sibling block of the same Event when one block is cancelled', async () => {
    const { churchId, ministryId, assignMe } = await seedWorld();
    const cycle = await seedCycle({
      churchId,
      name: 'Current',
      startOffsetMs: -DAY_MS,
      endOffsetMs: 20 * DAY_MS,
    });
    const first = await seedShiftGraph({
      churchId,
      ministryId,
      cycleId: cycle.id,
      title: 'Two blocks',
      startOffsetMs: DAY_MS,
      endOffsetMs: DAY_MS + HOUR_MS,
    });
    const siblingStart = fromNow(DAY_MS + HOUR_MS);
    const siblingEnd = fromNow(DAY_MS + 2 * HOUR_MS);
    const siblingBlock = await buildEventTimeBlock({
      db,
      churchId,
      eventId: first.graph.event.id,
      start: siblingStart.toISOString() as Instant,
      end: siblingEnd.toISOString() as Instant,
      label: 'Sibling',
    });
    const sibling = {
      graph: first.graph,
      shift: await seedShift({
        churchId,
        participationId: first.graph.participation.id,
        eventTimeBlockId: siblingBlock.id,
        startTime: siblingStart,
        endTime: siblingEnd,
        label: 'Sibling',
      }),
    };
    const inCancelled = await assignMe(first);
    const inSibling = await assignMe(sibling);
    await db
      .update(eventTimeBlock)
      .set({ status: 'cancelled' })
      .where(eq(eventTimeBlock.id, first.graph.eventTimeBlock.id));

    const mine = await app.inject({ method: 'GET', url: SCHEDULE_URL });
    const ministry = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${ministryId}/schedule?cycleId=${cycle.id}`,
    });
    const detail = (id: string) =>
      app.inject({ method: 'GET', url: `/api/v1/volunteer/assignments/${id}` });

    expect(
      mine
        .json()
        .assignments.map((a: { assignmentId: string }) => a.assignmentId),
    ).toEqual([inSibling.id]);
    const rowShiftIds = ministry
      .json()
      .events.flatMap((item: { rows: { shiftId: string }[] }) =>
        item.rows.map(({ shiftId }) => shiftId),
      );
    expect(rowShiftIds).toContain(sibling.shift.id);
    expect(rowShiftIds).not.toContain(first.shift.id);
    expect((await detail(inSibling.id)).statusCode).toBe(200);
    expect((await detail(inCancelled.id)).statusCode).toBe(404);
  });

  it('answers the stale-link 404 for an Assignment in a cancelled Event or block', async () => {
    const { liveAssignment, inEvent, inBlock } = await seedCancelled();
    const get = (id: string) =>
      app.inject({ method: 'GET', url: `/api/v1/volunteer/assignments/${id}` });

    expect((await get(liveAssignment.id)).statusCode).toBe(200);
    expect((await get(inEvent.id)).statusCode).toBe(404);
    expect((await get(inBlock.id)).statusCode).toBe(404);
  });
});
