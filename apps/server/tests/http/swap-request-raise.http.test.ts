import { appConfig } from '@church/app-config';
import { assignment, ministryParticipation, swapRequest } from '@church/db';
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
import { SwapRequestController } from '@/api/controllers/swap-request-controller';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbSwapRequestManager } from '@/application/db-swap-request-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
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
  const activeChurchResolver = new DbActiveChurchResolver({
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
  });
  const swapRequestRepo = new DrizzleSwapRequestRepository({ db });
  const controllers = [
    new SwapRequestController({
      activeChurchResolver,
      swapRequestManager: new DbSwapRequestManager({
        swapRequestRepo,
        assignmentRepo: new DrizzleAssignmentRepository({ db }),
        participationRepo: new DrizzleMinistryParticipationRepository({ db }),
        shiftRepo: new DrizzleShiftRepository({ db }),
        unitOfWork: new DrizzleUnitOfWork({ db }),
        config: appConfig,
      }),
    }),
    new VolunteerController({
      volunteerManager: createSchedulingManagers().volunteerManager,
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

async function seedGraph({ year = 2030 }: { year?: number } = {}) {
  const base = await seedSchedulingPhase3Base();
  const { churchAId: churchId, ministryAId: ministryId } = base;
  const period = await createSchedulingPhase3Cycle({
    churchId,
    name: 'Future',
    startDate: new Date(`${year}-10-01`),
    endDate: new Date(`${year}-10-31`),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    ministryId,
    cycleId: period.id,
    title: 'Sunday Service',
    start: new Date(`${year}-10-13T13:00:00Z`),
    end: new Date(`${year}-10-13T15:00:00Z`),
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
    startTime: new Date(`${year}-10-13T13:00:00Z`),
    endTime: new Date(`${year}-10-13T15:00:00Z`),
    label: 'Morning',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const requirement = await seedRequirement({
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 2,
  });
  const seedMember = async (name: string, email: string) => {
    const member = await seedVolunteerMembership({
      churchId,
      ministryId,
      name,
      email,
      ministryAccessLevel: 'volunteer',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: member.volunteer.userId,
      accessLevel: 'member',
    });
    return member;
  };
  const me = await seedMember('Maria Souza Lima', 'maria@test.com');
  const other = await seedMember('Joao Pereira', 'joao@test.com');
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
  getSession.mockResolvedValue({
    user: { id: me.volunteer.userId },
    session: { activeOrganizationId: churchId },
  } as never);
  return { churchId, graph, shift, me, mine, theirs };
}

const raise = (id: string, body: object = {}) =>
  app.inject({
    method: 'POST',
    url: `${ROOT}/${id}/swap-requests`,
    payload: body,
  });

describe('Raise a swap request', () => {
  it('stores one open request with the note and leaves the Assignment untouched', async () => {
    const { mine, me } = await seedGraph();
    const response = await raise(mine.id, { note: '  João will cover  ' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assignmentId: mine.id,
      status: 'open',
      note: 'João will cover',
    });
    const rows = await db.select().from(swapRequest);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assignmentId: mine.id,
      status: 'open',
      raisedBy: me.volunteer.userId,
    });
    const [after] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, mine.id));
    expect(after).toMatchObject({ status: 'confirmed', id: mine.id });
  });

  it('accepts a request without a note and shows it on the detail read', async () => {
    const { mine } = await seedGraph();
    expect((await raise(mine.id)).statusCode).toBe(201);
    const detail = await app.inject({
      method: 'GET',
      url: `${ROOT}/${mine.id}`,
    });
    expect(detail.json().swapRequest).toMatchObject({
      status: 'open',
      note: null,
    });
  });

  it('is 401 without a session', async () => {
    const { mine } = await seedGraph();
    getSession.mockResolvedValue(null);
    expect((await raise(mine.id)).statusCode).toBe(401);
  });

  it('is a concealed 404 for another Volunteer’s or an unknown Assignment', async () => {
    const { theirs } = await seedGraph();
    expect((await raise(theirs.id)).statusCode).toBe(404);
    expect(
      (await raise('99999999-9999-4999-8999-999999999999')).statusCode,
    ).toBe(404);
    expect(await db.select().from(swapRequest)).toHaveLength(0);
  });

  it('is 409 SWAP_REQUEST_UNPUBLISHED when the Schedule is not published', async () => {
    const { mine, graph } = await seedGraph();
    await db
      .update(ministryParticipation)
      .set({ state: 'preparing' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    const response = await raise(mine.id);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('SWAP_REQUEST_UNPUBLISHED');
  });

  it('is 409 SWAP_REQUEST_SHIFT_STARTED once the Shift has started', async () => {
    const { mine } = await seedGraph({ year: 2020 });
    const response = await raise(mine.id);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('SWAP_REQUEST_SHIFT_STARTED');
  });

  it('is 409 SWAP_REQUEST_ALREADY_OPEN for a second request', async () => {
    const { mine } = await seedGraph();
    expect((await raise(mine.id)).statusCode).toBe(201);
    const response = await raise(mine.id, { note: 'again' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('SWAP_REQUEST_ALREADY_OPEN');
    expect(await db.select().from(swapRequest)).toHaveLength(1);
  });

  it('accepts a note of exactly the limit', async () => {
    const { mine } = await seedGraph();
    const note = 'x'.repeat(appConfig.swapRequest.noteMaxLength);
    expect((await raise(mine.id, { note })).statusCode).toBe(201);
  });

  it('is 400 naming the limit when the note is too long', async () => {
    const { mine } = await seedGraph();
    const max = appConfig.swapRequest.noteMaxLength;
    const response = await raise(mine.id, { note: 'x'.repeat(max + 1) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('SWAP_REQUEST_NOTE_TOO_LONG');
    expect(response.json().message).toContain(String(max));
    expect(await db.select().from(swapRequest)).toHaveLength(0);
  });
});
