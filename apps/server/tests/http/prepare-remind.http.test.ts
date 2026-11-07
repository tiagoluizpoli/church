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

const ASKED_AT = '2026-09-02T15:00:00.000Z';
const REMINDED_AT = '2026-09-03T15:00:00.000Z';
const REMIND_AVAILABLE_AT = '2026-09-04T15:00:00.000Z';
const JUST_BEFORE_AVAILABLE = '2026-09-04T14:59:59.999Z';
const AFTER_CYCLE = '2026-10-05T15:00:00.000Z';
const SERVICE_START = new Date('2026-09-06T12:00:00.000Z');
const SERVICE_END = new Date('2026-09-06T14:00:00.000Z');

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
  setClock({ value: ASKED_AT });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClock();
});

interface SetClockInput {
  value: string;
}

function setClock({ value }: SetClockInput) {
  setTestClock({ instant: parseInstant({ value }) });
}

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
  roleIds?: string[];
}

async function seedServingPerson({
  churchId,
  ministryId,
  ministryAccessLevel = 'volunteer',
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
  return { userId, membershipId: membership.id };
}

/** One served Event whose Shift needs Teacher, plus a signed-in ChurchAdmin. */
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
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId,
    ministryId,
    title: 'Service',
    start: SERVICE_START,
    end: SERVICE_END,
    status: 'scheduled',
  });
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: SERVICE_START,
    endTime: SERVICE_END,
    label: 'Whole block',
  });
  await seedRequirement({
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: teacher.id,
    peopleNeeded: 1,
  });
  const admin = await seedPerson({ churchId, accessLevel: 'admin' });
  signIn({ userId: admin, churchId });
  return { seed, churchId, ministryId, cycleId, teacher, graph };
}

/** The Schedule already asked of one Teacher holder, with the outbox emptied. */
async function seedAsked() {
  const schedule = await seedSchedule();
  const { churchId, ministryId, cycleId, teacher } = schedule;
  const holder = await seedServingPerson({
    churchId,
    ministryId,
    roleIds: [teacher.id],
  });
  const asked = await ask({ cycleId, ministryId });
  expect(asked.statusCode).toBe(200);
  await db.delete(outboxMessage);
  return { ...schedule, holder };
}

interface ScheduleKey {
  cycleId: string;
  ministryId: string;
}

function ask({ cycleId, ministryId }: ScheduleKey) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/prepare/cycles/${cycleId}/ask-availability`,
    payload: { ministryId },
  });
}

function remind({ cycleId, ministryId }: ScheduleKey) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/prepare/cycles/${cycleId}/remind`,
    payload: { ministryId },
  });
}

function listChecks() {
  return db.select().from(availabilityCheck);
}

async function lastRemindedAt() {
  const [record] = await db.select().from(availabilityAsk);
  return record?.lastRemindedAt ?? null;
}

interface QueuedPayload {
  kind: string;
  to: { userId: string };
  data: unknown;
}

async function listQueued() {
  const rows = await db.select().from(outboxMessage);
  return rows.map((row) => row.payload as QueuedPayload);
}

describe('POST /prepare/cycles/:cycleId/remind', () => {
  it('reminds the not-confirmed, opens checks for the newly eligible and leaves the confirmed and ended alone', async () => {
    const { churchId, ministryId, cycleId, teacher, holder } =
      await seedAsked();
    const confirmedVolunteer = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id],
    });
    const endedVolunteer = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id],
    });
    // Asked directly, as if these two held the Role when the Ask went out.
    await db.insert(availabilityCheck).values([
      {
        churchId,
        cycleId,
        ministryMembershipId: confirmedVolunteer.membershipId,
        state: 'confirmed',
        confirmedAt: new Date(ASKED_AT),
      },
      {
        churchId,
        cycleId,
        ministryMembershipId: endedVolunteer.membershipId,
      },
    ]);
    await db
      .update(ministryMembership)
      .set({ status: 'inactive', leftAt: new Date(ASKED_AT) })
      .where(eq(ministryMembership.id, endedVolunteer.membershipId));
    const newcomer = await seedServingPerson({
      churchId,
      ministryId,
      roleIds: [teacher.id],
    });
    await seedServingPerson({ churchId, ministryId });
    setClock({ value: REMINDED_AT });

    const response = await remind({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      remindedCount: 1,
      newCheckCount: 1,
      remindAvailableAt: REMIND_AVAILABLE_AT,
    });
    const queued = await listQueued();
    expect(queued.map(({ kind, to }) => ({ kind, userId: to.userId }))).toEqual(
      expect.arrayContaining([
        { kind: 'availability_reminder', userId: holder.userId },
        { kind: 'availability_opened', userId: newcomer.userId },
      ]),
    );
    expect(queued).toHaveLength(2);
    expect(queued[0]?.data).toEqual({ cycleId, ministryId });
    const newCheck = (await listChecks()).find(
      (check) => check.ministryMembershipId === newcomer.membershipId,
    );
    expect(newCheck?.state).toBe('pending');
    expect(await lastRemindedAt()).toEqual(new Date(REMINDED_AT));
  });

  it("leaves another Ministry's asked Volunteers in the same Cycle alone", async () => {
    const { churchId, ministryId, cycleId, holder } = await seedAsked();
    const otherMinistry = await buildMinistry({
      db,
      churchId,
      name: 'Other Ministry',
    });
    const other = await seedServingPerson({
      churchId,
      ministryId: otherMinistry.id,
    });
    await db.insert(availabilityCheck).values({
      churchId,
      cycleId,
      ministryMembershipId: other.membershipId,
    });

    const response = await remind({ cycleId, ministryId });

    expect(response.json().remindedCount).toBe(1);
    const queued = await listQueued();
    expect(queued.map(({ to }) => to.userId)).toEqual([holder.userId]);
  });

  it('gives a withdrawn check neither a new check nor any Notification', async () => {
    const { ministryId, cycleId, holder } = await seedAsked();
    await db
      .update(availabilityCheck)
      .set({ withdrawnAt: new Date(ASKED_AT) })
      .where(eq(availabilityCheck.ministryMembershipId, holder.membershipId));

    const response = await remind({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      remindedCount: 0,
      newCheckCount: 0,
    });
    expect(await listChecks()).toHaveLength(1);
    expect(await listQueued()).toEqual([]);
  });

  describe('cooldown', () => {
    it('refuses an early call with the next-available Instant, then opens exactly at it', async () => {
      const { churchId, ministryId, cycleId, teacher, holder } =
        await seedAsked();
      setClock({ value: REMINDED_AT });
      const first = await remind({ cycleId, ministryId });
      expect(first.statusCode).toBe(200);
      await db.delete(outboxMessage);
      const newcomer = await seedServingPerson({
        churchId,
        ministryId,
        roleIds: [teacher.id],
      });
      setClock({ value: JUST_BEFORE_AVAILABLE });

      const early = await remind({ cycleId, ministryId });

      expect(early.statusCode).toBe(409);
      expect(early.json()).toMatchObject({
        error: 'REMIND_ON_COOLDOWN',
        remindAvailableAt: REMIND_AVAILABLE_AT,
      });
      expect(early.json().message).toEqual(expect.any(String));
      expect(await listChecks()).toHaveLength(1);
      expect(await listQueued()).toEqual([]);
      expect(await lastRemindedAt()).toEqual(new Date(REMINDED_AT));

      setClock({ value: REMIND_AVAILABLE_AT });
      const again = await remind({ cycleId, ministryId });

      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual({
        remindedCount: 1,
        newCheckCount: 1,
        remindAvailableAt: '2026-09-05T15:00:00.000Z',
      });
      const queued = await listQueued();
      expect(
        queued.map(({ kind, to }) => ({ kind, userId: to.userId })),
      ).toEqual(
        expect.arrayContaining([
          { kind: 'availability_reminder', userId: holder.userId },
          { kind: 'availability_opened', userId: newcomer.userId },
        ]),
      );
    });

    it('stamps on a zero-recipient press, so the next call is refused', async () => {
      const { ministryId, cycleId } = await seedAsked();
      await db
        .update(availabilityCheck)
        .set({ state: 'confirmed', confirmedAt: new Date(ASKED_AT) });
      setClock({ value: REMINDED_AT });

      const pressed = await remind({ cycleId, ministryId });

      expect(pressed.statusCode).toBe(200);
      expect(pressed.json()).toEqual({
        remindedCount: 0,
        newCheckCount: 0,
        remindAvailableAt: REMIND_AVAILABLE_AT,
      });
      expect(await listQueued()).toEqual([]);
      expect(await lastRemindedAt()).toEqual(new Date(REMINDED_AT));

      const repeat = await remind({ cycleId, ministryId });

      expect(repeat.statusCode).toBe(409);
      expect(repeat.json().error).toBe('REMIND_ON_COOLDOWN');
    });

    it('lets one of two simultaneous Reminds through', async () => {
      const { ministryId, cycleId } = await seedAsked();

      const responses = await Promise.all([
        remind({ cycleId, ministryId }),
        remind({ cycleId, ministryId }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        200, 409,
      ]);
      expect(await listQueued()).toHaveLength(1);
    });
  });

  describe('refusals', () => {
    it('refuses before the Ask and writes nothing', async () => {
      const { churchId, ministryId, cycleId, teacher } = await seedSchedule();
      await seedServingPerson({ churchId, ministryId, roleIds: [teacher.id] });

      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(await listChecks()).toEqual([]);
      expect(await listQueued()).toEqual([]);
    });

    interface ExpectRefusedUntouchedInput extends ScheduleKey {
      newcomerMembershipId: string;
    }

    async function expectRefusedUntouched({
      cycleId,
      ministryId,
      newcomerMembershipId,
    }: ExpectRefusedUntouchedInput) {
      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
      const checks = await listChecks();
      expect(checks.map((check) => check.ministryMembershipId)).not.toContain(
        newcomerMembershipId,
      );
      expect(await listQueued()).toEqual([]);
      expect(await lastRemindedAt()).toBeNull();
    }

    async function seedAskedWithNewcomer() {
      const asked = await seedAsked();
      const { churchId, ministryId, teacher } = asked;
      const newcomer = await seedServingPerson({
        churchId,
        ministryId,
        roleIds: [teacher.id],
      });
      return { ...asked, newcomerMembershipId: newcomer.membershipId };
    }

    it('refuses after publish', async () => {
      const { ministryId, cycleId, graph, newcomerMembershipId } =
        await seedAskedWithNewcomer();
      await db
        .update(ministryParticipation)
        .set({ state: 'published' })
        .where(eq(ministryParticipation.id, graph.participation.id));

      await expectRefusedUntouched({
        cycleId,
        ministryId,
        newcomerMembershipId,
      });
    });

    it('refuses a Cycle past its last day', async () => {
      const { ministryId, cycleId, newcomerMembershipId } =
        await seedAskedWithNewcomer();
      setClock({ value: AFTER_CYCLE });

      await expectRefusedUntouched({
        cycleId,
        ministryId,
        newcomerMembershipId,
      });
    });

    it('refuses a Cycle marked past', async () => {
      const { ministryId, cycleId, newcomerMembershipId } =
        await seedAskedWithNewcomer();
      await db
        .update(cycle)
        .set({ state: 'past' })
        .where(eq(cycle.id, cycleId));

      await expectRefusedUntouched({
        cycleId,
        ministryId,
        newcomerMembershipId,
      });
    });

    it('rolls everything back when a late write fails', async () => {
      const { ministryId, cycleId, newcomerMembershipId } =
        await seedAskedWithNewcomer();
      vi.spyOn(
        DrizzleAvailabilityCheckRepository.prototype,
        'stampReminded',
      ).mockRejectedValueOnce(new Error('injected stamp failure'));

      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(500);
      const checks = await listChecks();
      expect(checks.map((check) => check.ministryMembershipId)).not.toContain(
        newcomerMembershipId,
      );
      expect(await listQueued()).toEqual([]);
      expect(await lastRemindedAt()).toBeNull();
    });

    it('answers 422 for a malformed payload', async () => {
      const { cycleId } = await seedAsked();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/prepare/cycles/${cycleId}/remind`,
        payload: {},
      });

      expect(response.statusCode).toBe(422);
      expect(await lastRemindedAt()).toBeNull();
    });
  });

  describe('access', () => {
    it('lets a leader remind their own Ministry', async () => {
      const { churchId, ministryId, cycleId } = await seedAsked();
      const leader = await seedServingPerson({
        churchId,
        ministryId,
        ministryAccessLevel: 'leader',
      });
      signIn({ userId: leader.userId, churchId });

      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(200);
      expect(response.json().remindedCount).toBe(1);
    });

    it('answers 401 when signed out', async () => {
      const { ministryId, cycleId } = await seedAsked();
      mockGetSession.mockResolvedValue(null as never);

      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(401);
      expect(await lastRemindedAt()).toBeNull();
    });

    it('answers 403 for a Volunteer and for a plain member', async () => {
      const { churchId, ministryId, cycleId, holder } = await seedAsked();
      const member = await seedPerson({ churchId, accessLevel: 'member' });

      for (const userId of [holder.userId, member]) {
        signIn({ userId, churchId });
        const response = await remind({ cycleId, ministryId });
        expect(response.statusCode).toBe(403);
      }
      expect(await listQueued()).toEqual([]);
      expect(await lastRemindedAt()).toBeNull();
    });

    it("answers 404 for a leader on another Ministry's Schedule", async () => {
      const { churchId, ministryId, cycleId } = await seedAsked();
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

      const response = await remind({ cycleId, ministryId });

      expect(response.statusCode).toBe(404);
      expect(await lastRemindedAt()).toBeNull();
    });

    it("answers 404 for another Church's Ministry and Cycle, and an archived Ministry", async () => {
      const { seed, churchId, ministryId, cycleId } = await seedAsked();
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
        remind({ cycleId, ministryId: seed.ministryBId }),
        remind({ cycleId: foreignCycle.id, ministryId }),
        remind({ cycleId: randomUUID(), ministryId }),
        remind({ cycleId, ministryId: archived.id }),
      ]);

      expect(refusals.map((response) => response.statusCode)).toEqual([
        404, 404, 404, 404,
      ]);
      expect(await lastRemindedAt()).toBeNull();
    });
  });
});
