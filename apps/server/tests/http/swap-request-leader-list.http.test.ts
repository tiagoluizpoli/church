import { ministryParticipation, swapRequest } from '@church/db';
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
import { SwapRequestListController } from '@/api/controllers/swap-request-list-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbSwapRequestListManager } from '@/application/db-swap-request-list-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
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
let app: FastifyTypedInstance;
const HOUR = 3_600_000;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new SwapRequestListController({
    swapRequestManager: {} as never,
    swapRequestListManager: new DbSwapRequestListManager({
      swapRequestRepo: new DrizzleSwapRequestRepository({ db }),
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
        scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
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
  await resetSchedulingPhase3Db();
});

async function seedGraph() {
  const base = await seedSchedulingPhase3Base();
  const { churchAId: churchId, ministryAId: ministryId } = base;
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'Future',
    startDate: new Date('2030-10-01'),
    endDate: new Date('2030-10-31'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    ministryId,
    cycleId: cycle.id,
    title: 'Sunday Service',
    // Wide enough to hold Shifts before and after "now".
    start: new Date(Date.now() - 10 * 24 * HOUR),
    end: new Date(Date.now() + 10 * 24 * HOUR),
    status: 'scheduled',
  });
  await db
    .update(ministryParticipation)
    .set({ state: 'published' })
    .where(eq(ministryParticipation.id, graph.participation.id));
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const member = async (
    name: string,
    email: string,
    ministryAccessLevel: 'volunteer' | 'leader',
  ) => {
    const seeded = await seedVolunteerMembership({
      churchId,
      ministryId,
      name,
      email,
      ministryAccessLevel,
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: seeded.volunteer.userId,
      accessLevel: 'member',
    });
    return seeded;
  };
  const maria = await member('Maria Souza', 'maria@test.com', 'volunteer');
  const joao = await member('Joao Pereira', 'joao@test.com', 'volunteer');
  const ana = await member('Ana Leader', 'ana@test.com', 'leader');
  // A request on a Shift offset (hours) from now: [start, start + 2h].
  const requestOn = async ({
    volunteerId,
    startOffsetHours,
    status = 'open',
    note,
  }: {
    volunteerId: string;
    startOffsetHours: number;
    status?: 'open' | 'expired';
    note?: string;
  }) => {
    const startTime = new Date(Date.now() + startOffsetHours * HOUR);
    const shift = await seedShift({
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime,
      endTime: new Date(startTime.getTime() + 2 * HOUR),
      label: 'Morning',
    });
    const requirement = await seedRequirement({
      churchId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const assigned = await buildAssignment({
      db,
      churchId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status: 'confirmed',
    });
    const [row] = await db
      .insert(swapRequest)
      .values({
        churchId,
        assignmentId: assigned.id,
        status,
        note,
        raisedBy: (volunteerId === maria.volunteer.id ? maria : joao).volunteer
          .userId,
      })
      .returning();
    return row as NonNullable<typeof row>;
  };
  return { base, churchId, ministryId, cycle, maria, joao, ana, requestOn };
}

const signInAs = ({
  userId,
  churchId,
}: {
  userId: string | null;
  churchId: string;
}) =>
  getSession.mockResolvedValue(
    userId
      ? ({
          user: { id: userId },
          session: { activeOrganizationId: churchId },
        } as never)
      : null,
  );

const list = ({
  ministryId,
  query = '',
}: {
  ministryId: string;
  query?: string;
}) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ministries/${ministryId}/swap-requests${query}`,
  });

describe('Leader swap request read', () => {
  it('lists open requests per Schedule with note, Shift line and open count; expired only until the Shift ends', async () => {
    const { base, churchId, ministryId, cycle, maria, joao, ana, requestOn } =
      await seedGraph();
    const upcoming = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
      note: 'Joao covers',
    });
    // Started 1h ago, ends in 1h: stored open, reported expired.
    await requestOn({ volunteerId: joao.volunteer.id, startOffsetHours: -1 });
    // Ended long ago: no longer listed.
    await requestOn({ volunteerId: joao.volunteer.id, startOffsetHours: -48 });
    // Closed requests are never listed.
    await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 48,
    }).then((row) =>
      db
        .update(swapRequest)
        .set({ status: 'withdrawn' })
        .where(eq(swapRequest.id, row.id)),
    );

    for (const userId of [ana.volunteer.userId, base.adminUserId]) {
      signInAs({ userId, churchId });
      const response = await list({ ministryId });
      expect(response.statusCode).toBe(200);
      const [schedule, ...rest] = response.json().schedules;
      expect(rest).toHaveLength(0);
      expect(schedule).toMatchObject({ cycleId: cycle.id, openCount: 1 });
      expect(
        schedule.requests.map((r: { status: string }) => r.status).sort(),
      ).toEqual(['expired', 'open']);
      const open = schedule.requests.find(
        (r: { status: string }) => r.status === 'open',
      );
      expect(open).toMatchObject({
        id: upcoming.id,
        assignmentId: upcoming.assignmentId,
        volunteerName: 'Maria Souza',
        eventTitle: 'Sunday Service',
        roleName: 'Teacher',
        note: 'Joao covers',
      });
      expect(open.raisedAt).toBeTruthy();
      expect(open.startsAt).toBeTruthy();
    }
  });

  it('filters by Schedule (cycleId)', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    await requestOn({ volunteerId: maria.volunteer.id, startOffsetHours: 24 });
    signInAs({ userId: ana.volunteer.userId, churchId });
    const other = await list({
      ministryId,
      query: '?cycleId=99999999-9999-4999-8999-999999999999',
    });
    expect(other.json().schedules).toEqual([]);
  });

  it('is a concealed 404 for a Volunteer who does not lead the Ministry, 401 unsigned', async () => {
    const { churchId, ministryId, maria, requestOn } = await seedGraph();
    await requestOn({ volunteerId: maria.volunteer.id, startOffsetHours: 24 });
    signInAs({ userId: maria.volunteer.userId, churchId });
    const denied = await list({ ministryId });
    expect(denied.statusCode).toBe(404);
    expect(JSON.stringify(denied.json())).not.toContain('Joao');
    signInAs({ userId: null, churchId });
    expect((await list({ ministryId })).statusCode).toBe(401);
  });
});
