import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  ministry,
  ministryParticipation,
  participationEventTimeBlockInclusion,
} from '@church/db';
import { fromDate } from '@church/time';
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
import {
  buildEvent,
  buildEventTimeBlock,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
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

interface GetPreviewInput {
  cycleId: string;
  ministryId: string;
}

function getPreview({ cycleId, ministryId }: GetPreviewInput) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/prepare/cycles/${cycleId}/ask-preview?ministryId=${ministryId}`,
  });
}

interface SeedCycleInput {
  churchId: string;
}

function seedCycle({ churchId }: SeedCycleInput) {
  return createSchedulingPhase3Cycle({
    churchId,
    name: 'August',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-31T00:00:00.000Z'),
    state: 'sent',
  });
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
  const email = `${randomUUID()}@test.com`;
  const { user } = await buildVolunteerWithMembership({
    db,
    churchId,
    ministryId,
    name,
    email,
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
  return user.id;
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
 * Ministry A in August, a worked example:
 *
 *   Sunday, staffed block      Morning needs Vocals, Drums twice (two Sectors)
 *                              Late needs Keys
 *   Sunday, flagged block      Two Shifts with no requirements
 *   Wednesday, staffed block   Midweek needs Vocals and Drums
 *   Cancelled Event            Vocals and Bass (not served)
 *   Another Ministry           Its own Greeter (not this Schedule)
 *
 *   Ana holds Vocals                 eligible
 *   Bia holds Vocals and Keys        eligible, counted once
 *   Caio holds Lights                not needed
 *   Lea leads, holds nothing         not eligible
 *   Davi holds Drums, ended          neither eligible nor a holder
 *
 * Volunteers: 2. Shifts: 5. Events: 2. Drums has no holder across 2 Shifts.
 */
async function seedSchedule() {
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
  const bass = await buildRole({ ...child, name: 'Bass' });
  const lights = await buildRole({ ...child, name: 'Lights' });
  const stage = await buildSector({ ...child, name: 'Stage' });
  const booth = await buildSector({ ...child, name: 'Booth' });
  const cycle = await seedCycle({ churchId });

  const sunday = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
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
  await seedBlockShift({
    ...onSunday,
    needs: [
      { roleId: vocals.id, sectorId: stage.id },
      { roleId: drums.id, sectorId: stage.id },
      { roleId: drums.id, sectorId: booth.id },
    ],
  });
  await seedBlockShift({
    ...onSunday,
    needs: [{ roleId: keys.id, sectorId: stage.id }],
  });
  const flaggedBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.event.id,
    start: fromDate({ date: new Date('2026-08-02T18:00:00.000Z') }),
    end: fromDate({ date: new Date('2026-08-02T20:00:00.000Z') }),
  });
  await db.insert(participationEventTimeBlockInclusion).values({
    churchId,
    participationId: sunday.participation.id,
    eventTimeBlockId: flaggedBlock.id,
  });
  const onFlaggedBlock = {
    churchId,
    participationId: sunday.participation.id,
    eventTimeBlock: flaggedBlock,
    needs: [],
  };
  await seedBlockShift(onFlaggedBlock);
  await seedBlockShift(onFlaggedBlock);

  const wednesday = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Wednesday',
    start: new Date('2026-08-05T22:00:00.000Z'),
    end: new Date('2026-08-05T23:00:00.000Z'),
  });
  await seedBlockShift({
    churchId,
    participationId: wednesday.participation.id,
    eventTimeBlock: wednesday.eventTimeBlock,
    needs: [
      { roleId: vocals.id, sectorId: stage.id },
      { roleId: drums.id, sectorId: stage.id },
    ],
  });

  const cancelled = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Cancelled',
    start: new Date('2026-08-09T09:00:00.000Z'),
    end: new Date('2026-08-09T11:00:00.000Z'),
    status: 'cancelled',
  });
  await seedBlockShift({
    churchId,
    participationId: cancelled.participation.id,
    eventTimeBlock: cancelled.eventTimeBlock,
    needs: [
      { roleId: vocals.id, sectorId: stage.id },
      { roleId: bass.id, sectorId: stage.id },
    ],
  });

  const otherMinistry = await buildMinistry({
    db,
    churchId,
    name: 'Other Ministry',
  });
  const greeter = await buildRole({
    db,
    churchId,
    ministryId: otherMinistry.id,
    name: 'Greeter',
  });
  const door = await buildSector({
    db,
    churchId,
    ministryId: otherMinistry.id,
    name: 'Door',
  });
  const otherGraph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId: otherMinistry.id,
    title: 'Other',
    start: new Date('2026-08-02T09:00:00.000Z'),
    end: new Date('2026-08-02T11:00:00.000Z'),
  });
  await seedBlockShift({
    churchId,
    participationId: otherGraph.participation.id,
    eventTimeBlock: otherGraph.eventTimeBlock,
    needs: [{ roleId: greeter.id, sectorId: door.id }],
  });

  const inMinistry = { churchId, ministryId };
  await seedMember({ ...inMinistry, name: 'Ana', roleIds: [vocals.id] });
  await seedMember({
    ...inMinistry,
    name: 'Bia',
    roleIds: [vocals.id, keys.id],
  });
  await seedMember({ ...inMinistry, name: 'Caio', roleIds: [lights.id] });
  await seedMember({
    ...inMinistry,
    name: 'Davi',
    roleIds: [drums.id],
    status: 'inactive',
  });
  const leaderUserId = await seedMember({
    ...inMinistry,
    name: 'Lea',
    ministryAccessLevel: 'leader',
  });

  return {
    churchId,
    adminUserId,
    leaderUserId,
    churchBId,
    ministryId,
    otherMinistryId: otherMinistry.id,
    cycleId: cycle.id,
    drumsId: drums.id,
    flaggedBlock,
  };
}

const expectedPreview = ({
  drumsId,
  flaggedBlock,
}: Awaited<ReturnType<typeof seedSchedule>>) => ({
  eligibleVolunteerCount: 2,
  shiftCount: 5,
  eventCount: 2,
  flaggedBlocks: [
    {
      eventTimeBlockId: flaggedBlock.id,
      startsAt: '2026-08-02T18:00:00.000Z',
    },
  ],
  rolesWithoutHolders: [{ roleId: drumsId, roleName: 'Drums', shiftCount: 2 }],
});

describe('GET /prepare/cycles/:cycleId/ask-preview', () => {
  it("computes a ChurchAdmin's preview from the real graph", async () => {
    const schedule = await seedSchedule();
    const { churchId, adminUserId, cycleId, ministryId } = schedule;
    signIn({ userId: adminUserId, churchId });

    const response = await getPreview({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedPreview(schedule));
  });

  it("answers a leader's preview of their own Ministry", async () => {
    const schedule = await seedSchedule();
    const { churchId, leaderUserId, cycleId, ministryId } = schedule;
    signIn({ userId: leaderUserId, churchId });

    const response = await getPreview({ cycleId, ministryId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedPreview(schedule));
  });

  it('answers zeroes and writes nothing when the Ministry serves nothing', async () => {
    const { churchId, adminUserId, cycleId } = await seedSchedule();
    const idle = await buildMinistry({ db, churchId, name: 'Idle' });
    await buildEvent({
      db,
      churchId,
      cycleId,
      title: 'Not served',
      start: fromDate({ date: new Date('2026-08-16T09:00:00.000Z') }),
      end: fromDate({ date: new Date('2026-08-16T11:00:00.000Z') }),
      status: 'scheduled',
    });
    signIn({ userId: adminUserId, churchId });
    const participationsBefore = await db.select().from(ministryParticipation);

    const response = await getPreview({ cycleId, ministryId: idle.id });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eligibleVolunteerCount: 0,
      shiftCount: 0,
      eventCount: 0,
      flaggedBlocks: [],
      rolesWithoutHolders: [],
    });
    expect(await db.select().from(ministryParticipation)).toEqual(
      participationsBefore,
    );
  });

  it('answers 401 when signed out', async () => {
    const { cycleId, ministryId } = await seedSchedule();
    mockGetSession.mockResolvedValue(null as never);

    expect((await getPreview({ cycleId, ministryId })).statusCode).toBe(401);
  });

  it('answers 403 for a Volunteer and for a plain member', async () => {
    const { churchId, cycleId, ministryId } = await seedSchedule();
    const volunteerUserId = await seedMember({
      churchId,
      ministryId,
      name: 'Serving volunteer',
    });

    signIn({ userId: volunteerUserId, churchId });
    expect((await getPreview({ cycleId, ministryId })).statusCode).toBe(403);

    signIn({ userId: await seedPlainMember({ churchId }), churchId });
    expect((await getPreview({ cycleId, ministryId })).statusCode).toBe(403);
  });

  it("answers 404 for another Ministry's preview to a leader", async () => {
    const { churchId, leaderUserId, cycleId, otherMinistryId } =
      await seedSchedule();
    signIn({ userId: leaderUserId, churchId });

    const response = await getPreview({
      cycleId,
      ministryId: otherMinistryId,
    });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for an archived Ministry', async () => {
    const { churchId, adminUserId, cycleId, ministryId } = await seedSchedule();
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, ministryId));
    signIn({ userId: adminUserId, churchId });

    expect((await getPreview({ cycleId, ministryId })).statusCode).toBe(404);
  });

  it('refuses a leader of an archived Ministry: 404 while leading another, else 403', async () => {
    const { churchId, cycleId, ministryId } = await seedSchedule();
    const second = await buildMinistry({ db, churchId, name: 'Second' });
    const { user, volunteer } = await buildVolunteerWithMembership({
      db,
      churchId,
      ministryId: second.id,
      name: 'Mia',
      email: `${randomUUID()}@test.com`,
      ministryAccessLevel: 'leader',
    });
    await buildMinistryMembership({
      db,
      churchId,
      ministryId,
      volunteerId: volunteer.id,
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: user.id,
      accessLevel: 'member',
    });
    signIn({ userId: user.id, churchId });

    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, second.id));
    expect(
      (await getPreview({ cycleId, ministryId: second.id })).statusCode,
    ).toBe(404);

    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, ministryId));
    expect(
      (await getPreview({ cycleId, ministryId: second.id })).statusCode,
    ).toBe(403);
  });

  it('answers 404 for a Ministry or Cycle of another Church', async () => {
    const { churchId, churchBId, adminUserId, cycleId, ministryId } =
      await seedSchedule();
    const foreignMinistry = await buildMinistry({
      db,
      churchId: churchBId,
      name: 'Foreign',
    });
    const foreignCycle = await seedCycle({ churchId: churchBId });
    signIn({ userId: adminUserId, churchId });

    expect(
      (await getPreview({ cycleId, ministryId: foreignMinistry.id }))
        .statusCode,
    ).toBe(404);
    expect(
      (await getPreview({ cycleId: foreignCycle.id, ministryId })).statusCode,
    ).toBe(404);
  });

  it('answers 404 for a missing Cycle', async () => {
    const { churchId, adminUserId, ministryId } = await seedSchedule();
    signIn({ userId: adminUserId, churchId });

    const response = await getPreview({ cycleId: randomUUID(), ministryId });

    expect(response.statusCode).toBe(404);
  });
});
