import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
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
  type SeededCycleLifecycle,
} from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
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
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new PrepareController({
    config: appConfig,
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
  churchId: string;
}

function signIn({ userId, churchId }: SignInInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: churchId },
  } as never);
}

function getInsights() {
  return app.inject({ method: 'GET', url: '/api/v1/prepare/insights' });
}

interface SeedCycleInput {
  churchId: string;
  name: string;
  month: string;
  state: SeededCycleLifecycle;
}

function seedCycle({ churchId, name, month, state }: SeedCycleInput) {
  return createSchedulingPhase3Cycle({
    churchId,
    name,
    startDate: new Date(`${month}-01T00:00:00.000Z`),
    endDate: new Date(`${month}-28T00:00:00.000Z`),
    state,
  });
}

interface SeedStaffingInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  month: string;
  eventStatus?: 'scheduled' | 'cancelled';
  /** One requirement per entry: its headcount and the statuses of its assignments. */
  requirements: RequirementSeed[];
}

interface RequirementSeed {
  peopleNeeded: number;
  assignments: AssignmentStatus[];
}

async function seedStaffing({
  churchId,
  cycleId,
  ministryId,
  month,
  eventStatus = 'scheduled',
  requirements,
}: SeedStaffingInput) {
  const start = parseInstant({ value: `${month}-06T12:00:00.000Z` });
  const end = parseInstant({ value: `${month}-06T14:00:00.000Z` });
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
    state: 'assigning',
    eventTimeBlockIds: [block.id],
  });
  const shift = await seedShift({
    churchId,
    participationId: participation.id,
    eventTimeBlockId: block.id,
    startTime: new Date(`${month}-06T12:00:00Z`),
    endTime: new Date(`${month}-06T14:00:00Z`),
    label: 'Morning',
  });
  for (const { peopleNeeded, assignments } of requirements) {
    const role = await seedRole({
      churchId,
      ministryId,
      name: `Role ${randomUUID()}`,
    });
    const requirement = await seedRequirement({
      churchId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: role.id,
      peopleNeeded,
    });
    for (const status of assignments) {
      const person = await seedVolunteerMembership({
        churchId,
        ministryId,
        name: `Person ${randomUUID()}`,
        email: `${randomUUID()}@test.com`,
      });
      await buildAssignment({
        db,
        churchId,
        participationId: participation.id,
        shiftId: shift.id,
        roleId: role.id,
        shiftRequirementId: requirement.id,
        volunteerId: person.volunteer.id,
        status,
      });
    }
  }
}

interface SeedChecksInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  states: ('pending' | 'confirmed')[];
}

async function seedChecks({
  churchId,
  cycleId,
  ministryId,
  states,
}: SeedChecksInput) {
  for (const state of states) {
    const person = await seedVolunteerMembership({
      churchId,
      ministryId,
      name: `Asked ${randomUUID()}`,
      email: `${randomUUID()}@test.com`,
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId,
      ministryMembershipId: person.membership.id,
      state,
    });
  }
}

interface SeedLeaderInput {
  churchId: string;
  ministryId: string;
}

async function seedLeader({ churchId, ministryId }: SeedLeaderInput) {
  const userId = randomUUID();
  await buildUser({ db, id: userId, name: 'Leader', email: `${userId}@t.com` });
  await buildChurchMembership({ db, churchId, userId, accessLevel: 'member' });
  const volunteer = await buildVolunteer({ db, churchId, userId });
  await buildMinistryMembership({
    db,
    churchId,
    ministryId,
    volunteerId: volunteer.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
    teams: [],
  });
  return userId;
}

const EMPTY_STAFFING = {
  needed: 0,
  filled: 0,
};

describe('GET /prepare/insights', () => {
  it('totals the latest Sent and Past Cycles oldest first and ranks the focus Cycle Ministries least covered first', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = seed.churchAId;
    const alpha = await buildMinistry({ db, churchId, name: 'Alpha' });
    const august = await seedCycle({
      churchId,
      name: 'August',
      month: '2026-08',
      state: 'past-from-sent',
    });
    const september = await seedCycle({
      churchId,
      name: 'September',
      month: '2026-09',
      state: 'sent',
    });
    await seedCycle({
      churchId,
      name: 'October draft',
      month: '2026-10',
      state: 'draft',
    });
    await seedStaffing({
      churchId,
      cycleId: august.id,
      ministryId: seed.ministryAId,
      month: '2026-08',
      requirements: [{ peopleNeeded: 2, assignments: ['pending'] }],
    });
    // Over-assigned seats cap at the headcount; a cancelled one holds nothing.
    await seedStaffing({
      churchId,
      cycleId: september.id,
      ministryId: seed.ministryAId,
      month: '2026-09',
      requirements: [
        { peopleNeeded: 3, assignments: ['pending', 'cancelled'] },
        { peopleNeeded: 1, assignments: ['pending', 'draft'] },
      ],
    });
    await seedStaffing({
      churchId,
      cycleId: september.id,
      ministryId: alpha.id,
      month: '2026-09',
      requirements: [{ peopleNeeded: 1, assignments: ['pending'] }],
    });
    await seedStaffing({
      churchId,
      cycleId: september.id,
      ministryId: alpha.id,
      month: '2026-09',
      eventStatus: 'cancelled',
      requirements: [{ peopleNeeded: 5, assignments: [] }],
    });
    await seedChecks({
      churchId,
      cycleId: september.id,
      ministryId: seed.ministryAId,
      states: ['confirmed', 'pending', 'confirmed'],
    });
    signIn({ userId: seed.adminUserId, churchId });

    const response = await getInsights();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cycles: [
        {
          cycleId: august.id,
          name: 'August',
          startDate: '2026-08-01',
          endDate: '2026-08-28',
          needed: 2,
          filled: 1,
          asked: 0,
          answered: 0,
        },
        {
          cycleId: september.id,
          name: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-28',
          needed: 5,
          filled: 3,
          asked: 3,
          answered: 2,
        },
      ],
      focus: {
        cycleId: september.id,
        name: 'September',
        ministries: [
          {
            ministryId: seed.ministryAId,
            name: 'Scheduling Ministry A',
            needed: 4,
            filled: 2,
          },
          {
            ministryId: alpha.id,
            name: 'Alpha',
            needed: 1,
            filled: 1,
          },
        ],
      },
    });
  });

  it("scopes a leader's totals to the Ministries they lead", async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = seed.churchAId;
    const led = await buildMinistry({ db, churchId, name: 'Led' });
    const september = await seedCycle({
      churchId,
      name: 'September',
      month: '2026-09',
      state: 'sent',
    });
    await seedStaffing({
      churchId,
      cycleId: september.id,
      ministryId: seed.ministryAId,
      month: '2026-09',
      requirements: [{ peopleNeeded: 4, assignments: [] }],
    });
    await seedStaffing({
      churchId,
      cycleId: september.id,
      ministryId: led.id,
      month: '2026-09',
      requirements: [{ peopleNeeded: 2, assignments: ['pending'] }],
    });
    const leaderId = await seedLeader({ churchId, ministryId: led.id });
    signIn({ userId: leaderId, churchId });

    const response = await getInsights();

    expect(response.statusCode).toBe(200);
    expect(response.json().cycles).toEqual([
      expect.objectContaining({
        cycleId: september.id,
        needed: 2,
        filled: 1,
      }),
    ]);
    expect(response.json().focus.ministries).toEqual([
      {
        ministryId: led.id,
        name: 'Led',
        ...EMPTY_STAFFING,
        needed: 2,
        filled: 1,
      },
    ]);
  });

  it('answers empty totals and no focus without a Sent or Past Cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    signIn({ userId: seed.adminUserId, churchId: seed.churchAId });

    const response = await getInsights();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cycles: [], focus: null });
  });

  it('refuses a Church Member who leads no Ministry', async () => {
    const seed = await seedSchedulingPhase3Base();
    const userId = randomUUID();
    await buildUser({
      db,
      id: userId,
      name: 'Member',
      email: `${userId}@t.com`,
    });
    await buildChurchMembership({
      db,
      churchId: seed.churchAId,
      userId,
      accessLevel: 'member',
    });
    signIn({ userId, churchId: seed.churchAId });

    const response = await getInsights();

    expect(response.statusCode).toBe(403);
  });
});
