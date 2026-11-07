import { appConfig } from '@church/app-config';
import {
  availabilityAsk,
  availabilityCheck,
  cycle,
  ministryMembership,
  ministryParticipation,
} from '@church/db';
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
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import { buildMinistryMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  schedulingTestPool,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);
let app: FastifyTypedInstance;
const ROOT = '/api/v1/volunteer/availability-checks';

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
afterEach(() => {
  vi.restoreAllMocks();
});

async function seedCheck() {
  const base = await seedSchedulingPhase3Base();
  const churchId = base.churchAId;
  const ministryId = base.ministryAId;
  const period = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-30'),
    state: 'sent',
  });
  const member = await seedVolunteerMembership({
    churchId,
    ministryId,
    name: 'Answering Volunteer',
    email: 'answering@test.com',
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: member.volunteer.userId,
    accessLevel: 'member',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  await seedRoleQualification({
    churchId,
    membershipId: member.membership.id,
    roleId: role.id,
  });
  const check = await buildAvailabilityCheck({
    db,
    churchId,
    cycleId: period.id,
    ministryMembershipId: member.membership.id,
    state: 'pending',
  });
  await db.insert(availabilityAsk).values({
    churchId,
    ministryId,
    cycleId: period.id,
    askedAt: new Date('2026-08-01'),
    answerBy: '2026-09-05',
  });
  getSession.mockResolvedValue({
    user: { id: member.volunteer.userId },
    session: { activeOrganizationId: churchId },
  } as never);
  return { base, churchId, ministryId, period, member, role, check };
}

describe('Volunteer availability reads through PostgreSQL', () => {
  it('returns the Schedule Deadline for each check in a single query, pending before confirmed, excluding Past Cycles', async () => {
    const { churchId, ministryId, period, member, check } = await seedCheck();
    await db
      .update(availabilityCheck)
      .set({
        state: 'confirmed',
        confirmedAt: new Date('2026-08-02T12:00:00Z'),
      })
      .where(eq(availabilityCheck.id, check.id));
    const next = await createSchedulingPhase3Cycle({
      churchId,
      name: 'October',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      state: 'sent',
    });
    const pending = await buildAvailabilityCheck({
      db,
      churchId,
      cycleId: next.id,
      ministryMembershipId: member.membership.id,
      state: 'pending',
    });
    const past = await createSchedulingPhase3Cycle({
      churchId,
      name: 'Past',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      state: 'past',
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId: past.id,
      ministryMembershipId: member.membership.id,
      state: 'pending',
    });
    // Observe real SQL, retaining the actual PostgreSQL execution.
    const queries = vi.spyOn(schedulingTestPool, 'query');
    const response = await app.inject({ method: 'GET', url: ROOT });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      checks: [
        {
          id: pending.id,
          cycleId: next.id,
          cycleName: 'October',
          ministryId,
          ministryName: 'Scheduling Ministry A',
          state: 'pending',
          totalShiftCount: 0,
          unavailableShiftCount: 0,
          answerBy: null,
        },
        {
          id: check.id,
          cycleId: period.id,
          cycleName: 'September',
          ministryId,
          ministryName: 'Scheduling Ministry A',
          state: 'confirmed',
          confirmedAt: '2026-08-02T12:00:00.000Z',
          totalShiftCount: 0,
          unavailableShiftCount: 0,
          answerBy: '2026-09-05',
        },
      ],
    });
    const deadlineQueries = queries.mock.calls.filter(([query]) =>
      JSON.stringify(query).includes('availability_ask'),
    );
    expect(deadlineQueries).toHaveLength(1);
  });
  it('adds Deadline, Past-Cycle read-only and per-Shift publication while showing newly created held-Role Shifts unmarked', async () => {
    const { churchId, ministryId, period, role, check, member } =
      await seedCheck();
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      ministryId,
      cycleId: period.id,
      title: 'Sunday Service',
      start: new Date('2026-09-06T12:00:00Z'),
      end: new Date('2026-09-06T14:00:00Z'),
      status: 'scheduled',
    });
    const held = await seedShift({
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-09-06T12:00:00Z'),
      endTime: new Date('2026-09-06T14:00:00Z'),
      label: 'Morning',
    });
    await seedRequirement({
      churchId,
      participationId: graph.participation.id,
      shiftId: held.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const secondHeldRole = await seedRole({
      churchId,
      ministryId,
      name: 'Helper',
    });
    await seedRoleQualification({
      churchId,
      membershipId: member.membership.id,
      roleId: secondHeldRole.id,
    });
    await seedRequirement({
      churchId,
      participationId: graph.participation.id,
      shiftId: held.id,
      roleId: secondHeldRole.id,
      peopleNeeded: 1,
    });
    const otherRole = await seedRole({ churchId, ministryId, name: 'Singer' });
    const irrelevant = await seedShift({
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-09-06T12:00:00Z'),
      endTime: new Date('2026-09-06T14:00:00Z'),
      label: 'Other Role',
    });
    await seedRequirement({
      churchId,
      participationId: graph.participation.id,
      shiftId: irrelevant.id,
      roleId: otherRole.id,
      peopleNeeded: 1,
    });
    const response = await app.inject({
      method: 'GET',
      url: `${ROOT}/${check.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: check.id,
      cycleId: period.id,
      cycleName: 'September',
      ministryId,
      ministryName: 'Scheduling Ministry A',
      state: 'pending',
      answerBy: '2026-09-05',
      readOnly: false,
      shifts: [
        {
          shiftId: held.id,
          eventId: graph.event.id,
          eventTitle: 'Sunday Service',
          startTime: '2026-09-06T12:00:00.000Z',
          endTime: '2026-09-06T14:00:00.000Z',
          label: 'Morning',
          available: true,
          published: false,
        },
      ],
    });
    // Legacy marks for a Role no longer held do not inflate the read totals.
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: irrelevant.id,
    });
    const list = await app.inject({ method: 'GET', url: ROOT });
    expect(list.json().checks[0]).toMatchObject({
      totalShiftCount: 1,
      unavailableShiftCount: 0,
    });
    const saved = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/unavailable-shifts`,
      payload: { shiftIds: [held.id] },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().shifts).toMatchObject([
      { shiftId: held.id, available: false },
    ]);
    const marked = await app.inject({ method: 'GET', url: ROOT });
    expect(marked.json().checks[0]).toMatchObject({
      totalShiftCount: 1,
      unavailableShiftCount: 1,
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: `${ROOT}/${check.id}/confirm`,
    });
    expect(confirmed.statusCode).toBe(204);
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    const laterGraph = await createSchedulingPhase3EventGraph({
      churchId,
      ministryId,
      cycleId: period.id,
      title: 'Later Service',
      start: new Date('2026-09-13T12:00:00Z'),
      end: new Date('2026-09-13T14:00:00Z'),
      status: 'scheduled',
    });
    const later = await seedShift({
      churchId,
      participationId: laterGraph.participation.id,
      eventTimeBlockId: laterGraph.eventTimeBlock.id,
      startTime: new Date('2026-09-13T12:00:00Z'),
      endTime: new Date('2026-09-13T14:00:00Z'),
      label: 'Later',
    });
    await seedRequirement({
      churchId,
      participationId: laterGraph.participation.id,
      shiftId: later.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    await db
      .update(cycle)
      .set({ state: 'past' })
      .where(eq(cycle.id, period.id));
    const past = await app.inject({
      method: 'GET',
      url: `${ROOT}/${check.id}`,
    });
    expect(past.statusCode).toBe(200);
    expect(past.json()).toMatchObject({
      answerBy: '2026-09-05',
      readOnly: true,
      shifts: [
        { shiftId: held.id, available: false, published: true },
        { shiftId: later.id, available: true, published: false },
      ],
    });
  });

  it('keeps Deadlines scoped to each Ministry of the Cycle and hides another Church’s checks', async () => {
    const { base, churchId, period, member, check } = await seedCheck();
    const second = await buildMinistry({
      db,
      churchId,
      name: 'Second Ministry',
    });
    const membership = await buildMinistryMembership({
      db,
      churchId,
      ministryId: second.id,
      volunteerId: member.volunteer.id,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
      teams: [],
    });
    const secondCheck = await buildAvailabilityCheck({
      db,
      churchId,
      cycleId: period.id,
      ministryMembershipId: membership.id,
    });
    await db.insert(availabilityAsk).values({
      churchId,
      ministryId: second.id,
      cycleId: period.id,
      askedAt: new Date('2026-08-01'),
      answerBy: '2026-09-10',
    });
    const foreignCycle = await createSchedulingPhase3Cycle({
      churchId: base.churchBId,
      name: 'Foreign Cycle',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      state: 'sent',
    });
    const foreign = await seedVolunteerMembership({
      churchId: base.churchBId,
      ministryId: base.ministryBId,
      name: 'Foreign Volunteer',
      email: 'foreign@test.com',
    });
    const foreignCheck = await buildAvailabilityCheck({
      db,
      churchId: base.churchBId,
      cycleId: foreignCycle.id,
      ministryMembershipId: foreign.membership.id,
    });
    const response = await app.inject({ method: 'GET', url: ROOT });
    expect(response.statusCode).toBe(200);
    expect(response.json().checks).toHaveLength(2);
    expect(response.json().checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: check.id, answerBy: '2026-09-05' }),
        expect.objectContaining({ id: secondCheck.id, answerBy: '2026-09-10' }),
      ]),
    );
    const hidden = await app.inject({
      method: 'GET',
      url: `${ROOT}/${foreignCheck.id}`,
    });
    expect(hidden.statusCode).toBe(404);
  });

  it('retains 401 signed out, 403 without active serving membership and private 404 for another Volunteer', async () => {
    const { churchId, ministryId, check } = await seedCheck();
    const other = await seedVolunteerMembership({
      churchId,
      ministryId,
      name: 'Other Volunteer',
      email: 'other@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: other.volunteer.userId,
      accessLevel: 'member',
    });
    getSession.mockResolvedValue({
      user: { id: other.volunteer.userId },
      session: { activeOrganizationId: churchId },
    } as never);
    const privateCheck = await app.inject({
      method: 'GET',
      url: `${ROOT}/${check.id}`,
    });
    expect(privateCheck.statusCode).toBe(404);
    expect(privateCheck.json().error).toBe('NOT_FOUND');
    await db
      .update(ministryMembership)
      .set({ status: 'inactive', leftAt: new Date() })
      .where(eq(ministryMembership.id, other.membership.id));
    for (const url of [ROOT, `${ROOT}/${check.id}`]) {
      const inactive = await app.inject({ method: 'GET', url });
      expect(inactive.statusCode).toBe(403);
    }
    const plain = await buildUser({
      db,
      id: 'plain-member',
      name: 'Plain Member',
      email: 'plain@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: plain.id,
      accessLevel: 'member',
    });
    getSession.mockResolvedValue({
      user: { id: plain.id },
      session: { activeOrganizationId: churchId },
    } as never);
    for (const url of [ROOT, `${ROOT}/${check.id}`]) {
      const forbidden = await app.inject({ method: 'GET', url });
      expect(forbidden.statusCode).toBe(403);
    }
    getSession.mockResolvedValue(null as never);
    for (const url of [ROOT, `${ROOT}/${check.id}`]) {
      const signedOut = await app.inject({ method: 'GET', url });
      expect(signedOut.statusCode).toBe(401);
    }
  });
});
