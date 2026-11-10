import { randomUUID } from 'node:crypto';
import { assignment, ministry, outboxMessage } from '@church/db';
import { parseInstant } from '@church/time';
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
import type { ParticipationState } from '@/domain/entities/ministry-participation';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
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
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));

const { auth: mockAuth } = await import('@/main/di/server-auth');
const mockGetSession = vi.mocked(mockAuth.api.getSession);
const mockSetActiveOrganization = vi.mocked(mockAuth.api.setActiveOrganization);

const db = schedulingTestDb;

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories, resolver and AuthorityService: only the
  // Better Auth session is a seam.
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new PrepareController({
    participationManager: createSchedulingManagers().participationManager,
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

interface SignInInput {
  userId: string;
  churchId: string | null;
}

function signIn({ userId, churchId }: SignInInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: churchId },
  } as never);
}

function listSchedules() {
  return app.inject({ method: 'GET', url: '/api/v1/prepare/schedules' });
}

interface SeedPersonInput {
  churchId: string;
  accessLevel: 'admin' | 'member';
}

/** A Church Member with no Volunteer profile. */
async function seedMember({ churchId, accessLevel }: SeedPersonInput) {
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

interface SeedServingMemberInput {
  churchId: string;
  ministryIds: string[];
  ministryAccessLevel: 'leader' | 'volunteer';
}

async function seedServingMember({
  churchId,
  ministryIds,
  ministryAccessLevel,
}: SeedServingMemberInput) {
  const userId = await seedMember({ churchId, accessLevel: 'member' });
  const volunteer = await buildVolunteer({ db, churchId, userId });
  for (const ministryId of ministryIds) {
    await buildMinistryMembership({
      db,
      churchId,
      ministryId,
      volunteerId: volunteer.id,
      ministryAccessLevel,
      roleIds: [],
      teams: [],
    });
  }
  return userId;
}

interface SeedCycleInput {
  churchId: string;
  name: string;
  month: string;
  lastDay: string;
  state: 'draft' | 'sent' | 'past';
}

function seedCycle({ churchId, name, month, lastDay, state }: SeedCycleInput) {
  return createSchedulingPhase3Cycle({
    churchId,
    name,
    startDate: new Date(`${month}-01T00:00:00.000Z`),
    endDate: new Date(`${month}-${lastDay}T00:00:00.000Z`),
    state,
  });
}

interface SeedParticipationInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  state: ParticipationState;
  serves?: boolean;
  eventStatus?: 'scheduled' | 'cancelled';
}

async function seedParticipation({
  churchId,
  cycleId,
  ministryId,
  state,
  serves = true,
  eventStatus = 'scheduled',
}: SeedParticipationInput) {
  const start = parseInstant({ value: '2026-09-06T12:00:00.000Z' });
  const end = parseInstant({ value: '2026-09-06T14:00:00.000Z' });
  const planningEvent = await buildEvent({
    db,
    churchId,
    cycleId,
    title: 'Sunday service',
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
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: planningEvent.id,
    state,
    eventTimeBlockIds: serves ? [block.id] : [],
  });
  return { participation, block };
}

describe('late availability counts', () => {
  it('counts marks made after assignments for their Schedule', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      name: 'September',
      month: '2026-09',
      lastDay: '30',
      state: 'sent',
    });
    const { participation, block } = await seedParticipation({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      state: 'assigning',
    });
    const role = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Greeter',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: participation.id,
      eventTimeBlockId: block.id,
      startTime: new Date('2026-09-06T12:00:00Z'),
      endTime: new Date('2026-09-06T14:00:00Z'),
      label: 'Morning',
    });
    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const person = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Late',
      email: 'late-count@test.com',
    });
    await buildAssignment({
      db,
      churchId: seed.churchAId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      volunteerId: person.volunteer.id,
      status: 'pending',
      assignedAt: parseInstant({ value: '2020-01-01T00:00:00Z' }),
    });
    const check = await buildAvailabilityCheck({
      db,
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryMembershipId: person.membership.id,
      state: 'confirmed',
    });
    await buildUnavailableShift({
      db,
      churchId: seed.churchAId,
      availabilityCheckId: check.id,
      shiftId: shift.id,
    });
    signIn({ userId: seed.adminUserId, churchId: seed.churchAId });
    const assignmentsBefore = await db.select().from(assignment);
    const outboxBefore = await db.select().from(outboxMessage);
    const response = await listSchedules();
    expect(response.statusCode).toBe(200);
    expect(response.json().schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ministry: expect.objectContaining({ id: seed.ministryAId }),
          cycle: expect.objectContaining({ id: cycle.id }),
          lateMarkCount: 1,
        }),
      ]),
    );
    expect(await db.select().from(assignment)).toEqual(assignmentsBefore);
    expect(await db.select().from(outboxMessage)).toEqual(outboxBefore);
  });
});

describe('GET /prepare/schedules access', () => {
  it('answers 401 when signed out', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const response = await listSchedules();

    expect(response.statusCode).toBe(401);
  });

  it('answers 403 for a Volunteer who leads nothing and for a plain member', async () => {
    const { churchAId, ministryAId } = await seedSchedulingPhase3Base();

    signIn({
      userId: await seedServingMember({
        churchId: churchAId,
        ministryIds: [ministryAId],
        ministryAccessLevel: 'volunteer',
      }),
      churchId: churchAId,
    });
    expect((await listSchedules()).statusCode).toBe(403);

    signIn({
      userId: await seedMember({ churchId: churchAId, accessLevel: 'member' }),
      churchId: churchAId,
    });
    expect((await listSchedules()).statusCode).toBe(403);
  });

  it('answers 403 for the leader of an archived Ministry only', async () => {
    const { churchAId } = await seedSchedulingPhase3Base();
    const archived = await buildMinistry({
      db,
      churchId: churchAId,
      name: 'Archived',
    });
    const userId = await seedServingMember({
      churchId: churchAId,
      ministryIds: [archived.id],
      ministryAccessLevel: 'leader',
    });
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, archived.id));
    signIn({ userId, churchId: churchAId });

    expect((await listSchedules()).statusCode).toBe(403);
  });
});

describe('GET /prepare/schedules scoping', () => {
  /** Church A: Alpha, Beta, Gamma and one archived Ministry; one Draft, one Sent and one Past Cycle. */
  async function seedChurch() {
    const base = await seedSchedulingPhase3Base();
    const { churchAId: churchId } = base;
    const alpha = await buildMinistry({ db, churchId, name: 'Alpha' });
    const beta = await buildMinistry({ db, churchId, name: 'Beta' });
    await buildMinistry({ db, churchId, name: 'Gamma' });
    const archived = await buildMinistry({ db, churchId, name: 'Archived' });
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, archived.id));
    await seedCycle({
      churchId,
      name: 'November 2026',
      month: '2026-11',
      lastDay: '30',
      state: 'draft',
    });
    const sent = await seedCycle({
      churchId,
      name: 'October 2026',
      month: '2026-10',
      lastDay: '31',
      state: 'sent',
    });
    const past = await seedCycle({
      churchId,
      name: 'September 2026',
      month: '2026-09',
      lastDay: '30',
      state: 'past',
    });
    return {
      ...base,
      churchId,
      alpha,
      beta,
      sent,
      past,
    };
  }

  it('gives a ChurchAdmin without a Volunteer profile every active Ministry × Sent/Past Cycle, newest Cycle first', async () => {
    const seed = await seedChurch();
    signIn({
      userId: await seedMember({
        churchId: seed.churchId,
        accessLevel: 'admin',
      }),
      churchId: seed.churchId,
    });

    const response = await listSchedules();

    expect(response.statusCode).toBe(200);
    const { schedules } = response.json();
    expect(
      schedules.map(
        (row: { ministry: { name: string }; cycle: { name: string } }) =>
          `${row.cycle.name} · ${row.ministry.name}`,
      ),
    ).toEqual([
      'October 2026 · Alpha',
      'October 2026 · Beta',
      'October 2026 · Gamma',
      'October 2026 · Scheduling Ministry A',
      'September 2026 · Alpha',
      'September 2026 · Beta',
      'September 2026 · Gamma',
      'September 2026 · Scheduling Ministry A',
    ]);
    expect(schedules[0]).toEqual({
      ministry: { id: seed.alpha.id, name: 'Alpha' },
      cycle: {
        id: seed.sent.id,
        name: 'October 2026',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        state: 'sent',
      },
      stage: 'not_serving',
      lateMarkCount: 0,
      openSwapRequestCount: 0,
      affectedVolunteerCount: 0,
    });
    expect(schedules[4].cycle).toEqual({
      id: seed.past.id,
      name: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      state: 'past',
    });
  });

  it('gives a leader only the Ministries they lead, one or two', async () => {
    const seed = await seedChurch();
    const namesFor = async (ministryIds: string[]) => {
      signIn({
        userId: await seedServingMember({
          churchId: seed.churchId,
          ministryIds,
          ministryAccessLevel: 'leader',
        }),
        churchId: seed.churchId,
      });
      const response = await listSchedules();
      expect(response.statusCode).toBe(200);
      return response
        .json()
        .schedules.filter(
          (row: { cycle: { id: string } }) => row.cycle.id === seed.sent.id,
        )
        .map((row: { ministry: { name: string } }) => row.ministry.name);
    };

    expect(await namesFor([seed.alpha.id])).toEqual(['Alpha']);
    expect(await namesFor([seed.alpha.id, seed.beta.id])).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('never carries another Church across the Active Church boundary', async () => {
    const seed = await seedChurch();
    const foreignCycle = await seedCycle({
      churchId: seed.churchBId,
      name: 'Foreign cycle',
      month: '2026-10',
      lastDay: '31',
      state: 'sent',
    });
    await seedParticipation({
      churchId: seed.churchBId,
      cycleId: foreignCycle.id,
      ministryId: seed.ministryBId,
      state: 'published',
    });
    await buildChurchMembership({
      db,
      churchId: seed.churchBId,
      userId: seed.adminUserId,
      accessLevel: 'admin',
    });

    signIn({ userId: seed.adminUserId, churchId: seed.churchAId });
    const inChurchA = (await listSchedules()).json().schedules;
    expect(JSON.stringify(inChurchA)).not.toContain(foreignCycle.id);
    expect(JSON.stringify(inChurchA)).not.toContain(seed.ministryBId);

    signIn({ userId: seed.adminUserId, churchId: seed.churchBId });
    expect((await listSchedules()).json().schedules).toEqual([
      {
        ministry: { id: seed.ministryBId, name: 'Scheduling Ministry B' },
        cycle: {
          id: foreignCycle.id,
          name: 'Foreign cycle',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          state: 'sent',
        },
        stage: 'published',
        lateMarkCount: 0,
        openSwapRequestCount: 0,
        affectedVolunteerCount: 0,
      },
    ]);
  });

  it('refuses a session whose Active Church the caller does not belong to', async () => {
    const seed = await seedChurch();
    const userId = await seedMember({
      churchId: seed.churchBId,
      accessLevel: 'member',
    });
    signIn({ userId, churchId: seed.churchAId });

    const response = await listSchedules();

    expect(response.statusCode).toBe(403);
  });

  it('answers 404 when a row target names a foreign Church, Ministry or Cycle', async () => {
    const seed = await seedChurch();
    const foreignCycle = await seedCycle({
      churchId: seed.churchBId,
      name: 'Foreign cycle',
      month: '2026-10',
      lastDay: '31',
      state: 'sent',
    });
    const leader = await seedServingMember({
      churchId: seed.churchId,
      ministryIds: [seed.alpha.id],
      ministryAccessLevel: 'leader',
    });
    signIn({ userId: leader, churchId: seed.churchId });
    const openSchedule = (cycleId: string, ministryId: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/prepare/cycles/${cycleId}/participation?ministryId=${ministryId}`,
      });

    const own = await openSchedule(seed.sent.id, seed.alpha.id);
    const otherMinistry = await openSchedule(seed.sent.id, seed.beta.id);
    const foreignChurchMinistry = await openSchedule(
      seed.sent.id,
      seed.ministryBId,
    );
    const foreignChurchCycle = await openSchedule(
      foreignCycle.id,
      seed.alpha.id,
    );

    expect(own.statusCode).toBe(200);
    expect(otherMinistry.statusCode).toBe(404);
    expect(foreignChurchMinistry.statusCode).toBe(404);
    expect(foreignChurchCycle.statusCode).toBe(404);
  });
});

describe('GET /prepare/schedules stage', () => {
  async function seedOneSchedule() {
    const { churchAId: churchId, ministryAId: ministryId } =
      await seedSchedulingPhase3Base();
    const cycle = await seedCycle({
      churchId,
      name: 'October 2026',
      month: '2026-10',
      lastDay: '31',
      state: 'sent',
    });
    const userId = await seedMember({ churchId, accessLevel: 'admin' });
    signIn({ userId, churchId });
    return { churchId, ministryId, cycleId: cycle.id };
  }

  async function readRow() {
    const response = await listSchedules();
    expect(response.statusCode).toBe(200);
    const [row] = response.json().schedules;
    return row;
  }

  it.each([
    ['preparing', 'to_prepare'],
    ['assigning', 'assigning'],
    ['published', 'published'],
  ] as const)('reads %s as %s', async (state, stage) => {
    const seed = await seedOneSchedule();
    await seedParticipation({ ...seed, state });

    const row = await readRow();

    expect(row.stage).toBe(stage);
    expect(row).not.toHaveProperty('asking');
  });

  it('counts confirmed of asked while asking, leaving out withdrawn checks, ended memberships, other Ministries and other Cycles', async () => {
    const seed = await seedOneSchedule();
    const { churchId, ministryId, cycleId } = seed;
    await seedParticipation({ ...seed, state: 'availability_requested' });
    const otherCycle = await seedCycle({
      churchId,
      name: 'September 2026',
      month: '2026-09',
      lastDay: '30',
      state: 'past',
    });
    const otherMinistry = await buildMinistry({
      db,
      churchId,
      name: 'Other',
    });

    const seedMembership = async (
      targetMinistryId: string,
      status: 'active' | 'inactive' = 'active',
    ) => {
      const userId = await seedMember({ churchId, accessLevel: 'member' });
      const volunteer = await buildVolunteer({ db, churchId, userId });
      return buildMinistryMembership({
        db,
        churchId,
        ministryId: targetMinistryId,
        volunteerId: volunteer.id,
        ministryAccessLevel: 'volunteer',
        status,
        roleIds: [],
        teams: [],
      });
    };
    const confirmed = await seedMembership(ministryId);
    const pending = await seedMembership(ministryId);
    const otherPending = await seedMembership(ministryId);
    const withdrawn = await seedMembership(ministryId);
    const ended = await seedMembership(ministryId, 'inactive');
    const elsewhere = await seedMembership(otherMinistry.id);

    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: confirmed.id,
      state: 'confirmed',
    });
    for (const { id: ministryMembershipId } of [pending, otherPending]) {
      await buildAvailabilityCheck({
        db,
        churchId,
        cycleId,
        ministryMembershipId,
        state: 'pending',
      });
    }
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: withdrawn.id,
      state: 'confirmed',
      withdrawnAt: parseInstant({ value: '2026-09-20T12:00:00.000Z' }),
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: ended.id,
      state: 'confirmed',
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: elsewhere.id,
      state: 'confirmed',
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId: otherCycle.id,
      ministryMembershipId: confirmed.id,
      state: 'confirmed',
    });

    const { schedules } = (await listSchedules()).json();
    const row = schedules.find(
      (candidate: { cycle: { id: string }; ministry: { id: string } }) =>
        candidate.cycle.id === cycleId && candidate.ministry.id === ministryId,
    );

    expect(row.stage).toBe('asking');
    expect(row.asking).toEqual({ confirmed: 1, asked: 3 });
  });

  it('reports zero counts while asking a Ministry nobody could be asked in', async () => {
    const seed = await seedOneSchedule();
    await seedParticipation({ ...seed, state: 'availability_requested' });

    const row = await readRow();

    expect(row.stage).toBe('asking');
    expect(row.asking).toEqual({ confirmed: 0, asked: 0 });
  });

  it('reads a Ministry with no inclusions as not serving, with or without participations', async () => {
    const seed = await seedOneSchedule();
    expect((await readRow()).stage).toBe('not_serving');

    await seedParticipation({ ...seed, state: 'preparing', serves: false });

    expect((await readRow()).stage).toBe('not_serving');
  });

  it.each([
    [['published', 'preparing'], 'to_prepare'],
    [['published', 'availability_requested', 'assigning'], 'asking'],
    [['published', 'assigning'], 'assigning'],
    [['published', 'published'], 'published'],
  ] as const)('takes the furthest-behind stage of legacy mix %j', async (states, stage) => {
    const seed = await seedOneSchedule();
    for (const state of states) {
      await seedParticipation({ ...seed, state });
    }

    expect((await readRow()).stage).toBe(stage);
  });

  it('ignores an opted-out Event and a cancelled Event when finding the furthest-behind stage', async () => {
    const seed = await seedOneSchedule();
    await seedParticipation({ ...seed, state: 'published' });
    await seedParticipation({ ...seed, state: 'preparing', serves: false });
    await seedParticipation({
      ...seed,
      state: 'preparing',
      eventStatus: 'cancelled',
    });

    expect((await readRow()).stage).toBe('published');
  });

  it('keeps deriving the stage of a Past Cycle', async () => {
    const seed = await seedOneSchedule();
    const pastCycle = await seedCycle({
      churchId: seed.churchId,
      name: 'September 2026',
      month: '2026-09',
      lastDay: '30',
      state: 'past',
    });
    await seedParticipation({
      ...seed,
      cycleId: pastCycle.id,
      state: 'published',
    });

    const { schedules } = (await listSchedules()).json();
    const past = schedules.find(
      (row: { cycle: { id: string } }) => row.cycle.id === pastCycle.id,
    );

    expect(past.cycle.state).toBe('past');
    expect(past.stage).toBe('published');
  });
});
