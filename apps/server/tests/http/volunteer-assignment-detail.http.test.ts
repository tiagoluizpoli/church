import { appConfig } from '@church/app-config';
import { assignment, ministryParticipation } from '@church/db';
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
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildAssignment } from '@/seeds/builders/scheduling';
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
let app: FastifyTypedInstance;
const ROOT = '/api/v1/volunteer/assignments';

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new VolunteerController({
    volunteerManager: createSchedulingManagers().volunteerManager,
    activeChurchResolver: new DbActiveChurchResolver({
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
    }),
    config: appConfig,
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

async function seedVolunteer({
  churchId,
  ministryId,
  name,
  email,
  leader,
}: {
  churchId: string;
  ministryId: string;
  name: string;
  email: string;
  leader?: boolean;
}) {
  const member = await seedVolunteerMembership({
    churchId,
    ministryId,
    name,
    email,
    ministryAccessLevel: leader ? 'leader' : 'volunteer',
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: member.volunteer.userId,
    accessLevel: 'member',
  });
  return member;
}

async function seedGraph() {
  const base = await seedSchedulingPhase3Base();
  const { churchAId: churchId, ministryAId: ministryId } = base;
  const period = await createSchedulingPhase3Cycle({
    churchId,
    name: 'October',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-31'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    ministryId,
    cycleId: period.id,
    title: 'Sunday Service',
    start: new Date('2026-10-12T13:00:00Z'),
    end: new Date('2026-10-12T15:00:00Z'),
    status: 'scheduled',
  });
  await db
    .update(ministryParticipation)
    .set({ state: 'published' })
    .where(eq(ministryParticipation.id, graph.participation.id));
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: new Date('2026-10-12T13:00:00Z'),
    endTime: new Date('2026-10-12T15:00:00Z'),
    label: 'Morning',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const requirement = await seedRequirement({
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 3,
  });
  const me = await seedVolunteer({
    churchId,
    ministryId,
    name: 'Maria Souza Lima',
    email: 'maria@test.com',
  });
  const other = await seedVolunteer({
    churchId,
    ministryId,
    name: 'Joao Pereira',
    email: 'joao@test.com',
  });
  const leader = await seedVolunteer({
    churchId,
    ministryId,
    name: 'Ana Leader',
    email: 'ana@test.com',
    leader: true,
  });
  const assign = (volunteerId: string) =>
    buildAssignment({
      db,
      churchId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status: 'confirmed',
    });
  const mine = await assign(me.volunteer.id);
  const theirs = await assign(other.volunteer.id);
  const signIn = (userId: string) =>
    getSession.mockResolvedValue({
      user: { id: userId },
      session: { activeOrganizationId: churchId },
    } as never);
  signIn(me.volunteer.userId);
  return {
    churchId,
    ministryId,
    period,
    graph,
    shift,
    role,
    requirement,
    me,
    other,
    leader,
    mine,
    theirs,
    signIn,
  };
}

describe('Volunteer Assignment detail', () => {
  it('returns facts, grouped roster with the caller flagged, Open slots and the leader name', async () => {
    const { mine, ministryId, period, graph } = await seedGraph();
    const response = await app.inject({
      method: 'GET',
      url: `${ROOT}/${mine.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assignmentId: mine.id,
      eventId: graph.event.id,
      eventTitle: 'Sunday Service',
      startTime: '2026-10-12T13:00:00.000Z',
      endTime: '2026-10-12T15:00:00.000Z',
      cycleId: period.id,
      ministryId,
      ministryName: 'Scheduling Ministry A',
      sectorName: 'Geral',
      roleName: 'Teacher',
      leaderName: 'Ana Leader',
      roster: [
        {
          sectorName: 'Geral',
          roleName: 'Teacher',
          // Alphabetical for everyone; the caller is flagged, not moved first.
          people: [
            { name: 'Joao P.', isYou: false },
            { name: 'Maria L.', isYou: true },
          ],
          openCount: 1,
        },
      ],
      swapRequest: null,
    });
  });

  it('exposes no contact details', async () => {
    const { mine } = await seedGraph();
    const text = (
      await app.inject({ method: 'GET', url: `${ROOT}/${mine.id}` })
    ).body;
    expect(text).not.toContain('@test.com');
  });

  it('is 404 for another Volunteer, a cancelled Assignment, an unpublished Schedule and an unknown id', async () => {
    const { theirs, mine, graph } = await seedGraph();
    const get = (id: string) =>
      app.inject({ method: 'GET', url: `${ROOT}/${id}` });
    expect((await get(theirs.id)).statusCode).toBe(404);
    expect((await get('99999999-9999-4999-8999-999999999999')).statusCode).toBe(
      404,
    );
    expect((await get('not-a-uuid')).statusCode).toBe(404);

    await db
      .update(assignment)
      .set({ status: 'cancelled' })
      .where(eq(assignment.id, mine.id));
    expect((await get(mine.id)).statusCode).toBe(404);
    await db
      .update(assignment)
      .set({ status: 'confirmed' })
      .where(eq(assignment.id, mine.id));
    expect((await get(mine.id)).statusCode).toBe(200);

    await db
      .update(ministryParticipation)
      .set({ state: 'preparing' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    expect((await get(mine.id)).statusCode).toBe(404);
  });

  it('is 401 without a session', async () => {
    const { mine } = await seedGraph();
    getSession.mockResolvedValue(null);
    const response = await app.inject({
      method: 'GET',
      url: `${ROOT}/${mine.id}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('is 403 for a Church Member who does not serve in a Ministry', async () => {
    const { mine, churchId, signIn } = await seedGraph();
    const outsider = await buildUser({
      db,
      id: 'outsider-user',
      name: 'Outsider',
      email: 'outsider@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: outsider.id,
      accessLevel: 'member',
    });
    signIn(outsider.id);
    const response = await app.inject({
      method: 'GET',
      url: `${ROOT}/${mine.id}`,
    });
    expect(response.statusCode).toBe(403);
  });
});
