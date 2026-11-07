import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import { availabilityAsk, ministry } from '@church/db';
import { addMilliseconds, fromDate, parseInstant } from '@church/time';
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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PrepareController } from '@/api/controllers/prepare-controller';
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
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildShift, buildShiftRequirement } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildConfirmedAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
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

const { auth: mockAuth } = await import('@/main/di/server-auth');
const mockGetSession = vi.mocked(mockAuth.api.getSession);
const mockSetActiveOrganization = vi.mocked(mockAuth.api.setActiveOrganization);

const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 24 * HOUR_MS;
const CONFIRMED_AT = '2026-08-01T12:00:00.000Z';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories, resolver and AuthorityService: only the
  // Better Auth session is a seam.
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const controller = new PrepareController({
    participationManager: {} as never,
    availabilityCheckManager: new DbAvailabilityCheckManager({
      participationRepository: new DrizzleMinistryParticipationRepository({
        db,
      }),
      eventRepository: new DrizzlePlanningEventRepository({ db }),
      availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
        db,
      }),
      cycleRepository: new DrizzleCycleRepository({ db }),
      ministryRepository,
      churchRepository: new DrizzleChurchRepository({ db }),
      notifications: {} as never,
      unitOfWork,
      config: appConfig,
    }),
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork,
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository,
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

interface GetAnswersInput {
  cycleId: string;
  ministryId: string;
}

function getAnswers({ cycleId, ministryId }: GetAnswersInput) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/prepare/cycles/${cycleId}/availability-status?ministryId=${ministryId}`,
  });
}

interface AnswersRow {
  volunteerName: string;
}

interface SortByNameInput<Row> {
  statuses: Row[];
}

function sortByName<Row extends AnswersRow>({
  statuses,
}: SortByNameInput<Row>): Row[] {
  return [...statuses].sort((left, right) =>
    left.volunteerName.localeCompare(right.volunteerName),
  );
}

interface SeedMemberInput {
  churchId: string;
  ministryId: string;
  name: string;
  roleIds?: string[];
  status?: 'active' | 'inactive';
  ministryAccessLevel?: 'leader' | 'volunteer';
}

async function seedMember({
  churchId,
  ministryId,
  name,
  roleIds = [],
  status,
  ministryAccessLevel,
}: SeedMemberInput) {
  const { user, volunteer, membership } = await buildVolunteerWithMembership({
    db,
    churchId,
    ministryId,
    name,
    email: `${randomUUID()}@test.com`,
    roleIds,
    status,
    ministryAccessLevel,
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: user.id,
    accessLevel: 'member',
  });
  return { userId: user.id, volunteerId: volunteer.id, membership };
}

interface SeedPlainMemberInput {
  churchId: string;
}

async function seedPlainMember({ churchId }: SeedPlainMemberInput) {
  const userId = randomUUID();
  await buildUser({
    db,
    id: userId,
    name: 'Plain member',
    email: `${userId}@test.com`,
  });
  await buildChurchMembership({
    db,
    churchId,
    userId,
    accessLevel: 'member',
  });
  return userId;
}

interface ServedPlace {
  roleId: string;
  sectorId: string;
}

interface SeedBlockShiftInput {
  churchId: string;
  participationId: string;
  eventTimeBlock: { id: string; startTime: Date; endTime: Date };
  needs: ServedPlace[];
}

async function seedBlockShift({
  churchId,
  participationId,
  eventTimeBlock,
  needs,
}: SeedBlockShiftInput) {
  const shift = await buildShift({
    db,
    churchId,
    participationId,
    eventTimeBlockId: eventTimeBlock.id,
    start: fromDate({ date: eventTimeBlock.startTime }),
    end: fromDate({ date: eventTimeBlock.endTime }),
  });
  for (const { roleId, sectorId } of needs) {
    await buildShiftRequirement({
      db,
      churchId,
      participationId,
      shiftId: shift.id,
      roleId,
      sectorId,
      peopleNeeded: 1,
    });
  }
  return shift;
}

/**
 * Ministry A asked about August, a worked example:
 *
 *   Sunday      Morning needs Vocals and Drums; Late needs Keys
 *   Wednesday   Midweek needs Vocals
 *   Cancelled   Vocals (not served)
 *
 *   Ana   Vocals         pending, no marks                  0 of 2
 *   Bia   Vocals, Keys   confirmed, Morning + Late marked   2 of 3
 *                        + a Cancelled mark that never counts
 *   Caio  Drums          confirmed, no marks                0 of 1
 *   Duda  Vocals         eligible, no check yet             no row
 *   Eli   Lights         never asked                        no row
 *   Fabi  Vocals         check withdrawn                    no row
 *   Gui   Vocals         ended membership                   no row
 *   Lea   leads          never asked                        no row
 *
 * Ana also serves Other Ministry, whose own confirmed check stays out.
 */
async function seedAsked() {
  const {
    churchAId: churchId,
    churchBId,
    adminUserId,
    ministryAId: ministryId,
  } = await seedSchedulingPhase3Base();
  const child = { db, churchId, ministryId };
  const vocals = await buildRole({ ...child, name: 'Vocals' });
  const keys = await buildRole({ ...child, name: 'Keys' });
  const drums = await buildRole({ ...child, name: 'Drums' });
  const lights = await buildRole({ ...child, name: 'Lights' });
  const stage = await buildSector({ ...child, name: 'Stage' });
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'August',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-31T00:00:00.000Z'),
    state: 'sent',
  });
  const cycleId = cycle.id;

  const sunday = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId,
    ministryId,
    title: 'Sunday',
    start: new Date('2026-08-02T09:00:00.000Z'),
    end: new Date('2026-08-02T11:00:00.000Z'),
  });
  const onSunday = {
    churchId,
    participationId: sunday.participation.id,
    eventTimeBlock: sunday.eventTimeBlock,
  };
  const morning = await seedBlockShift({
    ...onSunday,
    needs: [
      { roleId: vocals.id, sectorId: stage.id },
      { roleId: drums.id, sectorId: stage.id },
    ],
  });
  const late = await seedBlockShift({
    ...onSunday,
    needs: [{ roleId: keys.id, sectorId: stage.id }],
  });
  const wednesday = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId,
    ministryId,
    title: 'Wednesday',
    start: new Date('2026-08-05T22:00:00.000Z'),
    end: new Date('2026-08-05T23:00:00.000Z'),
  });
  await seedBlockShift({
    churchId,
    participationId: wednesday.participation.id,
    eventTimeBlock: wednesday.eventTimeBlock,
    needs: [{ roleId: vocals.id, sectorId: stage.id }],
  });
  const cancelled = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId,
    ministryId,
    title: 'Cancelled',
    start: new Date('2026-08-09T09:00:00.000Z'),
    end: new Date('2026-08-09T11:00:00.000Z'),
    status: 'cancelled',
  });
  const cancelledShift = await seedBlockShift({
    churchId,
    participationId: cancelled.participation.id,
    eventTimeBlock: cancelled.eventTimeBlock,
    needs: [{ roleId: vocals.id, sectorId: stage.id }],
  });

  const inMinistry = { churchId, ministryId };
  const ana = await seedMember({
    ...inMinistry,
    name: 'Ana',
    roleIds: [vocals.id],
  });
  const bia = await seedMember({
    ...inMinistry,
    name: 'Bia',
    roleIds: [vocals.id, keys.id],
  });
  const caio = await seedMember({
    ...inMinistry,
    name: 'Caio',
    roleIds: [drums.id],
  });
  await seedMember({ ...inMinistry, name: 'Duda', roleIds: [vocals.id] });
  await seedMember({ ...inMinistry, name: 'Eli', roleIds: [lights.id] });
  const fabi = await seedMember({
    ...inMinistry,
    name: 'Fabi',
    roleIds: [vocals.id],
  });
  const gui = await seedMember({
    ...inMinistry,
    name: 'Gui',
    roleIds: [vocals.id],
    status: 'inactive',
  });
  const lea = await seedMember({
    ...inMinistry,
    name: 'Lea',
    ministryAccessLevel: 'leader',
  });

  await db.insert(availabilityAsk).values({
    churchId,
    ministryId,
    cycleId,
    askedAt: new Date('2026-08-01T09:00:00.000Z'),
    answerBy: '2026-08-20',
  });
  const inCycle = { db, churchId, cycleId };
  await buildAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: ana.membership.id,
  });
  const confirmedAt = parseInstant({ value: CONFIRMED_AT });
  const biaCheck = await buildConfirmedAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: bia.membership.id,
    confirmedAt,
  });
  for (const shift of [morning, late, cancelledShift]) {
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: biaCheck.id,
      shiftId: shift.id,
    });
  }
  await buildConfirmedAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: caio.membership.id,
    confirmedAt,
  });
  await buildAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: fabi.membership.id,
    withdrawnAt: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
  });
  await buildAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: gui.membership.id,
  });

  const otherMinistry = await buildMinistry({
    db,
    churchId,
    name: 'Other Ministry',
  });
  const anaElsewhere = await buildMinistryMembership({
    db,
    churchId,
    ministryId: otherMinistry.id,
    volunteerId: ana.volunteerId,
    ministryAccessLevel: 'volunteer',
    roleIds: [],
  });
  await buildConfirmedAvailabilityCheck({
    ...inCycle,
    id: randomUUID(),
    ministryMembershipId: anaElsewhere.id,
    confirmedAt,
  });

  return {
    churchId,
    churchBId,
    adminUserId,
    leaderUserId: lea.userId,
    ministryId,
    otherMinistryId: otherMinistry.id,
    cycleId,
    ana,
    bia,
    caio,
  };
}

interface SetLastRemindedInput {
  ministryId: string;
  lastRemindedAt: Date;
}

function setLastReminded({ ministryId, lastRemindedAt }: SetLastRemindedInput) {
  return db
    .update(availabilityAsk)
    .set({ lastRemindedAt })
    .where(eq(availabilityAsk.ministryId, ministryId));
}

describe('GET /prepare/cycles/:cycleId/availability-status', () => {
  it('lists asked Volunteers only, with their marks and relevant Shift totals', async () => {
    const { churchId, leaderUserId, cycleId, ministryId, ana, bia, caio } =
      await seedAsked();
    signIn({ userId: leaderUserId, churchId });

    const response = await getAnswers({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    const { statuses, ...header } = response.json();
    expect(header).toEqual({
      asked: 3,
      confirmed: 2,
      answerBy: '2026-08-20',
      remindAvailableAt: null,
    });
    expect(sortByName<AnswersRow>({ statuses })).toEqual([
      {
        volunteerId: ana.volunteerId,
        volunteerName: 'Ana',
        state: 'pending',
        unavailableShiftCount: 0,
        shiftCount: 2,
      },
      {
        volunteerId: bia.volunteerId,
        volunteerName: 'Bia',
        state: 'confirmed',
        confirmedAt: CONFIRMED_AT,
        unavailableShiftCount: 2,
        shiftCount: 3,
      },
      {
        volunteerId: caio.volunteerId,
        volunteerName: 'Caio',
        state: 'confirmed',
        confirmedAt: CONFIRMED_AT,
        unavailableShiftCount: 0,
        shiftCount: 1,
      },
    ]);
  });

  it('answers an empty read before the Ask', async () => {
    const { churchId, adminUserId, cycleId } = await seedAsked();
    const unasked = await buildMinistry({ db, churchId, name: 'Unasked' });
    await seedMember({ churchId, ministryId: unasked.id, name: 'Nia' });
    signIn({ userId: adminUserId, churchId });

    const response = await getAnswers({ cycleId, ministryId: unasked.id });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      asked: 0,
      confirmed: 0,
      answerBy: null,
      remindAvailableAt: null,
      statuses: [],
    });
  });

  it('answers a null Deadline when the Ask set none', async () => {
    const { churchId, adminUserId, cycleId, ministryId } = await seedAsked();
    await db
      .update(availabilityAsk)
      .set({ answerBy: null })
      .where(eq(availabilityAsk.ministryId, ministryId));
    signIn({ userId: adminUserId, churchId });

    const response = await getAnswers({ cycleId, ministryId });

    expect(response.json()).toMatchObject({ asked: 3, answerBy: null });
  });

  it('carries the next-available Instant while Remind cools down', async () => {
    const { churchId, adminUserId, cycleId, ministryId } = await seedAsked();
    const lastRemindedAt = new Date(Date.now() - HOUR_MS);
    await setLastReminded({ ministryId, lastRemindedAt });
    signIn({ userId: adminUserId, churchId });

    const response = await getAnswers({ cycleId, ministryId });

    const expected = addMilliseconds({
      instant: fromDate({ date: lastRemindedAt }),
      milliseconds: COOLDOWN_MS,
    });
    expect(response.json().remindAvailableAt).toBe(expected);
  });

  it('answers a null remindAvailableAt once the cooldown has passed', async () => {
    const { churchId, adminUserId, cycleId, ministryId } = await seedAsked();
    await setLastReminded({
      ministryId,
      lastRemindedAt: new Date(Date.now() - COOLDOWN_MS - HOUR_MS),
    });
    signIn({ userId: adminUserId, churchId });

    const response = await getAnswers({ cycleId, ministryId });

    expect(response.json().remindAvailableAt).toBeNull();
  });

  it('answers 401 when signed out', async () => {
    const { cycleId, ministryId } = await seedAsked();
    mockGetSession.mockResolvedValue(null as never);

    expect((await getAnswers({ cycleId, ministryId })).statusCode).toBe(401);
  });

  it('answers 403 for a Volunteer and for a plain member', async () => {
    const { churchId, cycleId, ministryId, ana } = await seedAsked();

    signIn({ userId: ana.userId, churchId });
    expect((await getAnswers({ cycleId, ministryId })).statusCode).toBe(403);

    signIn({ userId: await seedPlainMember({ churchId }), churchId });
    expect((await getAnswers({ cycleId, ministryId })).statusCode).toBe(403);
  });

  it("answers 404 for another Ministry's Answers to a leader", async () => {
    const { churchId, leaderUserId, cycleId, otherMinistryId } =
      await seedAsked();
    signIn({ userId: leaderUserId, churchId });

    const response = await getAnswers({
      cycleId,
      ministryId: otherMinistryId,
    });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for an archived Ministry', async () => {
    const { churchId, adminUserId, cycleId, ministryId } = await seedAsked();
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, ministryId));
    signIn({ userId: adminUserId, churchId });

    expect((await getAnswers({ cycleId, ministryId })).statusCode).toBe(404);
  });

  it('answers 404 for a Ministry or Cycle of another Church and a missing Cycle', async () => {
    const { churchId, churchBId, adminUserId, cycleId, ministryId } =
      await seedAsked();
    const foreignMinistry = await buildMinistry({
      db,
      churchId: churchBId,
      name: 'Foreign',
    });
    const foreignCycle = await createSchedulingPhase3Cycle({
      churchId: churchBId,
      name: 'Foreign August',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T00:00:00.000Z'),
      state: 'sent',
    });
    signIn({ userId: adminUserId, churchId });

    expect(
      (await getAnswers({ cycleId, ministryId: foreignMinistry.id }))
        .statusCode,
    ).toBe(404);
    expect(
      (await getAnswers({ cycleId: foreignCycle.id, ministryId })).statusCode,
    ).toBe(404);
    expect(
      (await getAnswers({ cycleId: randomUUID(), ministryId })).statusCode,
    ).toBe(404);
  });
});
