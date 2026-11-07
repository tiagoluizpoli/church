import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  availabilityAsk,
  availabilityCheck,
  cycle,
  ministry,
  ministryMembership,
  ministryParticipation,
  outboxMessage,
} from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbAvailabilityCheckManager } from '@/application/db-availability-check-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
  seedShift,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));

const { auth: mockAuth } = await import('@/main/di/server-auth');
const mockGetSession = vi.mocked(mockAuth.api.getSession);
const mockSetActiveOrganization = vi.mocked(mockAuth.api.setActiveOrganization);

const db = schedulingTestDb;

const DURING_CYCLE = '2026-09-02T15:00:00.000Z';
const AFTER_CYCLE = '2026-10-05T15:00:00.000Z';
const FIRST_START = new Date('2026-09-06T12:00:00.000Z');
const FIRST_END = new Date('2026-09-06T14:00:00.000Z');
const SECOND_START = new Date('2026-09-13T12:00:00.000Z');
const SECOND_END = new Date('2026-09-13T14:00:00.000Z');

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories, resolver and AuthorityService: only the
  // Better Auth session is a seam.
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new PrepareController({
    participationManager: createSchedulingManagers().participationManager,
    availabilityCheckManager: new DbAvailabilityCheckManager({
      participationRepository: new DrizzleMinistryParticipationRepository({
        db,
      }),
      eventRepository: new DrizzlePlanningEventRepository({ db }),
      availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
        db,
      }),
      cycleRepository: new DrizzleCycleRepository({ db }),
      ministryRepository: new DrizzleMinistryRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      notifications: new ChurchNotifications({
        outboxRepository: new DrizzleOutboxRepository({ db }),
      }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      config: appConfig,
    }),
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
  setTestClock({ instant: parseInstant({ value: DURING_CYCLE }) });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClock();
});

interface SignInInput {
  userId: string;
  churchId: string;
}

function signIn({ userId, churchId }: SignInInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: churchId },
  } as never);
}

interface SeedPersonInput {
  churchId: string;
  accessLevel: 'admin' | 'member';
}

/** A Church Member with no Volunteer profile. */
async function seedPerson({ churchId, accessLevel }: SeedPersonInput) {
  const userId = randomUUID();
  await buildUser({
    db,
    id: userId,
    name: `Person ${userId}`,
    email: `${userId}@test.com`,
  });
  await buildChurchMembership({ db, churchId, userId, accessLevel });
  return userId;
}

interface SeedServingPersonInput {
  churchId: string;
  ministryId: string;
  ministryAccessLevel?: 'leader' | 'volunteer';
  status?: 'active' | 'inactive';
  roleIds?: string[];
}

async function seedServingPerson({
  churchId,
  ministryId,
  ministryAccessLevel = 'volunteer',
  status = 'active',
  roleIds = [],
}: SeedServingPersonInput) {
  const userId = await seedPerson({ churchId, accessLevel: 'member' });
  const volunteer = await buildVolunteer({ db, churchId, userId });
  const membership = await buildMinistryMembership({
    db,
    churchId,
    ministryId,
    volunteerId: volunteer.id,
    ministryAccessLevel,
    roleIds: [],
    teams: [],
  });
  for (const roleId of roleIds) {
    await seedRoleQualification({
      churchId,
      membershipId: membership.id,
      roleId,
    });
  }
  if (status !== 'active') {
    await db
      .update(ministryMembership)
      .set({ status, leftAt: new Date() })
      .where(eq(ministryMembership.id, membership.id));
  }
  return { userId, membershipId: membership.id };
}

interface SeedServedEventInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  start: Date;
  end: Date;
  /** The Roles its one Shift needs; none leaves the Shift flagged. */
  roleIds: string[];
}

async function seedServedEvent({
  churchId,
  cycleId,
  ministryId,
  start,
  end,
  roleIds,
}: SeedServedEventInput) {
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId,
    ministryId,
    title: `Service ${start.toISOString()}`,
    start,
    end,
    status: 'scheduled',
  });
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: start,
    endTime: end,
    label: 'Whole block',
  });
  for (const roleId of roleIds) {
    await seedRequirement({
      churchId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId,
      peopleNeeded: 1,
    });
  }
  return { ...graph, shift };
}

/** Two served Events needing Teacher; Singer is needed by one and held by nobody. */
async function seedSchedule() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const { id: cycleId } = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-30T00:00:00.000Z'),
    state: 'sent',
  });
  const teacher = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const singer = await seedRole({ churchId, ministryId, name: 'Singer' });
  const usher = await seedRole({ churchId, ministryId, name: 'Usher' });
  const first = await seedServedEvent({
    churchId,
    cycleId,
    ministryId,
    start: FIRST_START,
    end: FIRST_END,
    roleIds: [teacher.id, singer.id],
  });
  const second = await seedServedEvent({
    churchId,
    cycleId,
    ministryId,
    start: SECOND_START,
    end: SECOND_END,
    roleIds: [teacher.id],
  });
  return {
    seed,
    churchId,
    ministryId,
    cycleId,
    teacher,
    singer,
    usher,
    first,
    second,
  };
}

interface AskInput {
  cycleId: string;
  ministryId: string;
  answerBy?: string;
}

function ask({ cycleId, ministryId, answerBy }: AskInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/prepare/cycles/${cycleId}/ask-availability`,
    payload: { ministryId, answerBy },
  });
}

interface PutDeadlineInput {
  cycleId: string;
  ministryId: string;
  answerBy: unknown;
}

function putDeadline({ cycleId, ministryId, answerBy }: PutDeadlineInput) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/prepare/cycles/${cycleId}/availability-deadline`,
    payload: { ministryId, answerBy },
  });
}

function listChecks() {
  return db.select().from(availabilityCheck);
}

function listAskRecords() {
  return db.select().from(availabilityAsk);
}

function listOutbox() {
  return db.select().from(outboxMessage);
}

interface QueuedPayload {
  kind: string;
  to: { userId: string };
  data: unknown;
}

async function listParticipationStates(ministryId: string) {
  const rows = await db
    .select({ state: ministryParticipation.state })
    .from(ministryParticipation)
    .where(eq(ministryParticipation.ministryId, ministryId));
  return rows.map((row) => row.state);
}

/** A Schedule with one Teacher holder and a signed-in ChurchAdmin. */
async function seedAskable() {
  const schedule = await seedSchedule();
  const { churchId, ministryId, teacher } = schedule;
  const holder = await seedServingPerson({
    churchId,
    ministryId,
    roleIds: [teacher.id],
  });
  const admin = await seedPerson({ churchId, accessLevel: 'admin' });
  signIn({ userId: admin, churchId });
  return { ...schedule, holder };
}

describe('POST /prepare/cycles/:cycleId/ask-availability', () => {
  it('asks only needed-Role holders, moves the whole Schedule and enqueues one notice per asked Volunteer in one Ask', async () => {
    const { churchId, ministryId, cycleId, teacher, singer, usher, seed } =
      await seedSchedule();
    const holder = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id],
    });
    const holderOfTwoRoles = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id, usher.id],
    });
    await seedServingPerson({ churchId, ministryId, roleIds: [usher.id] });
    await seedServingPerson({ churchId, ministryId });
    await seedServingPerson({
      churchId,
      ministryId,
      status: 'inactive',
      roleIds: [teacher.id],
    });
    // Another Ministry's Schedule in the same Cycle is not touched.
    const otherMinistry = await buildMinistry({
      db,
      churchId,
      name: 'Other Ministry',
    });
    await createSchedulingPhase3EventGraph({
      churchId,
      cycleId,
      ministryId: otherMinistry.id,
      title: 'Other service',
      start: FIRST_START,
      end: FIRST_END,
      status: 'scheduled',
    });
    const admin = await seedPerson({ churchId, accessLevel: 'admin' });
    signIn({ userId: admin, churchId });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      createdCheckCount: 2,
      notifiedVolunteerCount: 2,
      rolesWithoutHolders: [
        { roleId: singer.id, roleName: 'Singer', shiftCount: 1 },
      ],
    });
    const checks = await listChecks();
    expect(checks.map((check) => check.ministryMembershipId).sort()).toEqual(
      [holder.membershipId, holderOfTwoRoles.membershipId].sort(),
    );
    expect(checks.every((check) => check.state === 'pending')).toBe(true);
    expect(checks.every((check) => check.cycleId === cycleId)).toBe(true);
    expect(await listParticipationStates(ministryId)).toEqual([
      'availability_requested',
      'availability_requested',
    ]);
    expect(await listParticipationStates(otherMinistry.id)).toEqual([
      'preparing',
    ]);
    const [record, ...otherRecords] = await listAskRecords();
    expect(otherRecords).toEqual([]);
    expect(record).toMatchObject({
      churchId: seed.churchAId,
      ministryId,
      cycleId,
      askedAt: new Date(DURING_CYCLE),
      answerBy: null,
      lastRemindedAt: null,
    });
    const queued = (await listOutbox()).map(
      (row) => row.payload as QueuedPayload,
    );
    expect(queued.map(({ to }) => to.userId).sort()).toEqual(
      [holder.userId, holderOfTwoRoles.userId].sort(),
    );
    expect(queued.every(({ kind }) => kind === 'availability_opened')).toBe(
      true,
    );
    expect(queued[0]?.data).toEqual({ cycleId, ministryId });
  });

  interface ExpectNothingWrittenInput {
    ministryId: string;
  }

  async function expectNothingWritten({
    ministryId,
  }: ExpectNothingWrittenInput) {
    expect(await listChecks()).toEqual([]);
    expect(await listAskRecords()).toEqual([]);
    expect(await listOutbox()).toEqual([]);
    expect(await listParticipationStates(ministryId)).toEqual([
      'preparing',
      'preparing',
    ]);
  }

  it('persists the optional Deadline on the ask record', async () => {
    const { ministryId, cycleId } = await seedAskable();

    const response = await ask({
      cycleId,
      ministryId,
      answerBy: '2026-09-05',
    });

    expect(response.statusCode).toBe(200);
    const [record] = await listAskRecords();
    expect(record?.answerBy).toBe('2026-09-05');
  });

  it('refuses a malformed Deadline with 422 and writes nothing', async () => {
    const { ministryId, cycleId } = await seedAskable();

    const response = await ask({
      cycleId,
      ministryId,
      answerBy: '2026-02-30',
    });

    expect(response.statusCode).toBe(422);
    await expectNothingWritten({ ministryId });
  });

  it('lets a leader ask their own Ministry', async () => {
    const { churchId, ministryId, cycleId, teacher } = await seedSchedule();
    await seedServingPerson({ churchId, ministryId, roleIds: [teacher.id] });
    const leader = await seedServingPerson({
      churchId,
      ministryId,
      ministryAccessLevel: 'leader',
    });
    signIn({ userId: leader.userId, churchId });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json().createdCheckCount).toBe(1);
  });

  it('creates nothing on a repeat Ask', async () => {
    const { ministryId, cycleId, holder } = await seedAskable();
    const asked = await ask({ cycleId, ministryId });
    expect(asked.statusCode).toBe(200);

    const repeat = await ask({ cycleId, ministryId });

    expect(repeat.statusCode).toBe(409);
    expect(repeat.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect(await listChecks()).toHaveLength(1);
    expect(await listAskRecords()).toHaveLength(1);
    const queued = await listOutbox();
    expect(queued).toHaveLength(1);
    expect((queued[0]?.payload as QueuedPayload).to.userId).toBe(holder.userId);
  });

  it('lets one of two simultaneous Asks through', async () => {
    const { ministryId, cycleId } = await seedAskable();

    const responses = await Promise.all([
      ask({ cycleId, ministryId }),
      ask({ cycleId, ministryId }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect(await listChecks()).toHaveLength(1);
    expect(await listOutbox()).toHaveLength(1);
  });

  it('refuses while any participation is past preparing and moves none', async () => {
    const { ministryId, cycleId, second } = await seedAskable();
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, second.participation.id));

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect((await listParticipationStates(ministryId)).sort()).toEqual([
      'preparing',
      'published',
    ]);
    expect(await listChecks()).toEqual([]);
    expect(await listAskRecords()).toEqual([]);
    expect(await listOutbox()).toEqual([]);
  });

  it('refuses while a served Shift is flagged, carrying the flagged blocks', async () => {
    const { churchId, ministryId, cycleId } = await seedAskable();
    const flagged = await seedServedEvent({
      churchId,
      cycleId,
      ministryId,
      start: new Date('2026-09-20T12:00:00.000Z'),
      end: new Date('2026-09-20T14:00:00.000Z'),
      roleIds: [],
    });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ASK_BLOCKED_FLAGGED_SHIFTS',
      flaggedBlocks: [
        {
          eventTimeBlockId: flagged.eventTimeBlock.id,
          startsAt: '2026-09-20T12:00:00.000Z',
        },
      ],
    });
    expect(await listChecks()).toEqual([]);
    expect(await listAskRecords()).toEqual([]);
    expect(await listOutbox()).toEqual([]);
    expect(new Set(await listParticipationStates(ministryId))).toEqual(
      new Set(['preparing']),
    );
  });

  it('does not count a flagged Shift of a cancelled Event', async () => {
    const { churchId, ministryId, cycleId } = await seedAskable();
    const cancelled = await createSchedulingPhase3EventGraph({
      churchId,
      cycleId,
      ministryId,
      title: 'Cancelled service',
      start: new Date('2026-09-20T12:00:00.000Z'),
      end: new Date('2026-09-20T14:00:00.000Z'),
      status: 'cancelled',
    });
    await seedShift({
      churchId,
      participationId: cancelled.participation.id,
      eventTimeBlockId: cancelled.eventTimeBlock.id,
      startTime: new Date('2026-09-20T12:00:00.000Z'),
      endTime: new Date('2026-09-20T14:00:00.000Z'),
      label: 'Unstaffed',
    });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
  });

  it('refuses with zero eligible Volunteers', async () => {
    const { churchId, ministryId, cycleId, usher } = await seedSchedule();
    await seedServingPerson({ churchId, ministryId, roleIds: [usher.id] });
    const admin = await seedPerson({ churchId, accessLevel: 'admin' });
    signIn({ userId: admin, churchId });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason: 'ASK_NO_ELIGIBLE_VOLUNTEERS',
    });
    await expectNothingWritten({ ministryId });
  });

  it('refuses a Ministry serving nothing in the Cycle as zero eligible', async () => {
    const { churchId, cycleId } = await seedAskable();
    const idle = await buildMinistry({ db, churchId, name: 'Idle' });

    const response = await ask({ cycleId, ministryId: idle.id });

    expect(response.statusCode).toBe(422);
    expect(await listAskRecords()).toEqual([]);
  });

  it('never re-creates or notifies a membership holding a withdrawn check', async () => {
    const { churchId, ministryId, cycleId, teacher, holder } =
      await seedAskable();
    const returning = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id],
    });
    const withdrawn = await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: returning.membershipId,
      state: 'pending',
    });
    await db
      .update(availabilityCheck)
      .set({ withdrawnAt: new Date() })
      .where(eq(availabilityCheck.id, withdrawn.id));

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    expect(await listChecks()).toHaveLength(2);
    const queued = await listOutbox();
    expect(
      queued.map((row) => (row.payload as QueuedPayload).to.userId),
    ).toEqual([holder.userId]);
  });

  it('refuses a Cycle past its last day', async () => {
    const { ministryId, cycleId } = await seedAskable();
    setTestClock({ instant: parseInstant({ value: AFTER_CYCLE }) });

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    await expectNothingWritten({ ministryId });
  });

  it.each(['past', 'draft'] as const)('refuses a %s Cycle', async (state) => {
    const { ministryId, cycleId } = await seedAskable();
    await db.update(cycle).set({ state }).where(eq(cycle.id, cycleId));

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    await expectNothingWritten({ ministryId });
  });

  it('rolls everything back when the enqueue fails', async () => {
    const { ministryId, cycleId } = await seedAskable();
    vi.spyOn(ChurchNotifications.prototype, 'enqueue').mockRejectedValueOnce(
      new Error('injected enqueue failure'),
    );

    const response = await ask({ cycleId, ministryId });

    expect(response.statusCode).toBe(500);
    await expectNothingWritten({ ministryId });
  });

  it('answers 422 for a malformed payload', async () => {
    const { ministryId, cycleId } = await seedAskable();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/prepare/cycles/${cycleId}/ask-availability`,
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    await expectNothingWritten({ ministryId });
  });

  describe('access', () => {
    it('answers 401 when signed out', async () => {
      const { ministryId, cycleId } = await seedSchedule();
      mockGetSession.mockResolvedValue(null as never);

      const response = await ask({ cycleId, ministryId });

      expect(response.statusCode).toBe(401);
      await expectNothingWritten({ ministryId });
    });

    it('answers 403 for a Volunteer and for a plain member', async () => {
      const { churchId, ministryId, cycleId, teacher } = await seedSchedule();
      const volunteer = await seedServingPerson({
        churchId,
        ministryId,
        roleIds: [teacher.id],
      });
      const member = await seedPerson({ churchId, accessLevel: 'member' });

      for (const userId of [volunteer.userId, member]) {
        signIn({ userId, churchId });
        const response = await ask({ cycleId, ministryId });
        expect(response.statusCode).toBe(403);
      }
      await expectNothingWritten({ ministryId });
    });

    it("answers 404 for a leader on another Ministry's Schedule", async () => {
      const { churchId, ministryId, cycleId, teacher } = await seedSchedule();
      await seedServingPerson({ churchId, ministryId, roleIds: [teacher.id] });
      const elsewhere = await buildMinistry({
        db,
        churchId,
        name: 'Elsewhere',
      });
      const leader = await seedServingPerson({
        churchId,
        ministryId: elsewhere.id,
        ministryAccessLevel: 'leader',
      });
      signIn({ userId: leader.userId, churchId });

      const response = await ask({ cycleId, ministryId });

      expect(response.statusCode).toBe(404);
      await expectNothingWritten({ ministryId });
    });

    it("answers 404 for another Church's Ministry and Cycle, and an archived Ministry", async () => {
      const { seed, churchId, ministryId, cycleId } = await seedAskable();
      const foreignCycle = await createSchedulingPhase3Cycle({
        churchId: seed.churchBId,
        name: 'Foreign',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        state: 'sent',
      });
      const archived = await buildMinistry({ db, churchId, name: 'Archived' });
      await db
        .update(ministry)
        .set({ deletedAt: new Date() })
        .where(eq(ministry.id, archived.id));

      const refusals = await Promise.all([
        ask({ cycleId, ministryId: seed.ministryBId }),
        ask({ cycleId: foreignCycle.id, ministryId }),
        ask({ cycleId: randomUUID(), ministryId }),
        ask({ cycleId, ministryId: archived.id }),
      ]);

      expect(refusals.map((response) => response.statusCode)).toEqual([
        404, 404, 404, 404,
      ]);
      await expectNothingWritten({ ministryId });
    });
  });
});

describe('PUT /prepare/cycles/:cycleId/availability-deadline', () => {
  /** A Schedule already asked, its Deadline unset. */
  async function seedAsked() {
    const schedule = await seedAskable();
    const { cycleId, ministryId } = schedule;
    const asked = await ask({ cycleId, ministryId });
    expect(asked.statusCode).toBe(200);
    return schedule;
  }

  it('sets, moves and clears the Deadline writing only the ask record', async () => {
    const { ministryId, cycleId } = await seedAsked();
    const [askedRecord] = await listAskRecords();
    const checksBefore = await listChecks();
    const outboxBefore = await listOutbox();
    const statesBefore = await listParticipationStates(ministryId);

    for (const answerBy of ['2026-09-05', '2026-09-10', null]) {
      const response = await putDeadline({ cycleId, ministryId, answerBy });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ answerBy });
      expect(await listAskRecords()).toEqual([{ ...askedRecord, answerBy }]);
    }

    expect(await listOutbox()).toEqual(outboxBefore);
    expect(outboxBefore).toHaveLength(1);
    expect(await listChecks()).toEqual(checksBefore);
    expect(await listParticipationStates(ministryId)).toEqual(statesBefore);
  });

  it('leaves another Schedule of the Cycle alone', async () => {
    const { churchId, ministryId, cycleId } = await seedAsked();
    const otherMinistry = await buildMinistry({
      db,
      churchId,
      name: 'Other Ministry',
    });
    await db.insert(availabilityAsk).values({
      churchId,
      ministryId: otherMinistry.id,
      cycleId,
      askedAt: new Date(DURING_CYCLE),
      answerBy: '2026-09-20',
    });

    await putDeadline({ cycleId, ministryId, answerBy: '2026-09-05' });

    const days = (await listAskRecords()).map((record) => record.answerBy);
    expect(days.sort()).toEqual(['2026-09-05', '2026-09-20']);
  });

  it('allows it while the Schedule is assigning', async () => {
    const { ministryId, cycleId } = await seedAsked();
    await db
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(eq(ministryParticipation.ministryId, ministryId));

    const response = await putDeadline({
      cycleId,
      ministryId,
      answerBy: '2026-09-05',
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows it while part of the Schedule is still unpublished', async () => {
    const { ministryId, cycleId, second } = await seedAsked();
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, second.participation.id));

    const response = await putDeadline({
      cycleId,
      ministryId,
      answerBy: '2026-09-05',
    });

    expect(response.statusCode).toBe(200);
  });

  describe('refusals', () => {
    interface ExpectRefusedInput {
      cycleId: string;
      ministryId: string;
    }

    async function expectRefused({ cycleId, ministryId }: ExpectRefusedInput) {
      const response = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
      const records = await listAskRecords();
      expect(records.every((record) => record.answerBy === null)).toBe(true);
    }

    it('refuses before the Ask and creates no ask record', async () => {
      const { ministryId, cycleId } = await seedAskable();

      await expectRefused({ cycleId, ministryId });
      expect(await listAskRecords()).toEqual([]);
    });

    it('refuses a published Schedule', async () => {
      const { ministryId, cycleId } = await seedAsked();
      await db
        .update(ministryParticipation)
        .set({ state: 'published' })
        .where(eq(ministryParticipation.ministryId, ministryId));

      await expectRefused({ cycleId, ministryId });
    });

    it('refuses a Cycle past its last day', async () => {
      const { ministryId, cycleId } = await seedAsked();
      setTestClock({ instant: parseInstant({ value: AFTER_CYCLE }) });

      await expectRefused({ cycleId, ministryId });
    });

    it('refuses a Cycle in the past state', async () => {
      const { ministryId, cycleId } = await seedAsked();
      await db
        .update(cycle)
        .set({ state: 'past' })
        .where(eq(cycle.id, cycleId));

      await expectRefused({ cycleId, ministryId });
    });

    it.each([
      ['an impossible day', '2026-02-30'],
      ['a non-date', 'soon'],
      ['an Instant', '2026-09-05T12:00:00.000Z'],
      ['a missing value', undefined],
    ])('answers 422 for %s', async (_label, answerBy) => {
      const { ministryId, cycleId } = await seedAsked();

      const response = await putDeadline({ cycleId, ministryId, answerBy });

      expect(response.statusCode).toBe(422);
      const [record] = await listAskRecords();
      expect(record?.answerBy).toBeNull();
    });
  });

  describe('access', () => {
    it('answers 401 when signed out', async () => {
      const { ministryId, cycleId } = await seedAsked();
      mockGetSession.mockResolvedValue(null as never);

      const response = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });

      expect(response.statusCode).toBe(401);
    });

    it('lets a leader edit their own Ministry and refuses a Volunteer', async () => {
      const { churchId, ministryId, cycleId, holder } = await seedAsked();
      const leader = await seedServingPerson({
        churchId,
        ministryId,
        ministryAccessLevel: 'leader',
      });

      signIn({ userId: holder.userId, churchId });
      const refused = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });
      signIn({ userId: leader.userId, churchId });
      const allowed = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });

      expect(refused.statusCode).toBe(403);
      expect(allowed.statusCode).toBe(200);
    });

    it("answers 404 for another Ministry's leader and another Church's Cycle", async () => {
      const { churchId, ministryId, cycleId, seed } = await seedAsked();
      const otherMinistry = await buildMinistry({
        db,
        churchId,
        name: 'Other Ministry',
      });
      const foreignLeader = await seedServingPerson({
        churchId,
        ministryId: otherMinistry.id,
        ministryAccessLevel: 'leader',
      });
      const { id: foreignCycleId } = await createSchedulingPhase3Cycle({
        churchId: seed.churchBId,
        name: 'Other Church Cycle',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        state: 'sent',
      });

      const foreignCycle = await putDeadline({
        cycleId: foreignCycleId,
        ministryId,
        answerBy: '2026-09-05',
      });
      signIn({ userId: foreignLeader.userId, churchId });
      const foreignMinistry = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });

      expect(foreignCycle.statusCode).toBe(404);
      expect(foreignMinistry.statusCode).toBe(404);
      const [record] = await listAskRecords();
      expect(record?.answerBy).toBeNull();
    });

    it('answers 404 for an archived Ministry', async () => {
      const { ministryId, cycleId } = await seedAsked();
      await db
        .update(ministry)
        .set({ deletedAt: new Date() })
        .where(eq(ministry.id, ministryId));

      const response = await putDeadline({
        cycleId,
        ministryId,
        answerBy: '2026-09-05',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
