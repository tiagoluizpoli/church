import { appConfig } from '@church/app-config';
import {
  assignment,
  ministryParticipation,
  outboxMessage,
  swapRequest,
} from '@church/db';
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
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbSwapRequestListManager } from '@/application/db-swap-request-list-manager';
import { DbSwapRequestManager } from '@/application/db-swap-request-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
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

function makeManager() {
  const eventRepo = new DrizzleEventRepository({ db });
  const ministryRepo = new DrizzleMinistryRepository({ db });
  return new DbSwapRequestManager({
    swapRequestRepo: new DrizzleSwapRequestRepository({ db }),
    assignmentRepo: new DrizzleAssignmentRepository({ db }),
    participationRepo: new DrizzleMinistryParticipationRepository({ db }),
    shiftRepo: new DrizzleShiftRepository({ db }),
    eventRepo,
    ministryRepo,
    roleRepo: new DrizzleRoleRepository({ db }),
    churchRepo: new DrizzleChurchRepository({ db }),
    volunteerRepo: new DrizzleVolunteerRepository({ db }),
    recipients: new ChurchRecipients({
      churchRepository: new DrizzleChurchRepository({ db }),
      volunteerRepository: new DrizzleVolunteerRepository({ db }),
    }),
    notifications: new ChurchNotifications({
      outboxRepository: new DrizzleOutboxRepository({ db }),
    }),
    authorityManager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
      eventRepository: eventRepo,
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      ministryRepository: ministryRepo,
    }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    config: appConfig,
  });
}

const HOUR = 3_600_000;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new SwapRequestListController({
    swapRequestManager: makeManager(),
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

const keep = ({
  ministryId,
  swapRequestId,
  body = {},
}: {
  ministryId: string;
  swapRequestId: string;
  body?: object;
}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/swap-requests/${swapRequestId}/keep`,
    payload: body,
  });

const statusOf = async (id: string) =>
  (await db.select().from(swapRequest).where(eq(swapRequest.id, id)))[0];
const outbox = () =>
  db
    .select()
    .from(outboxMessage)
    .then((rows) =>
      rows.filter(
        (row) =>
          (row.payload as { kind?: string }).kind === 'swap_request_answered',
      ),
    );

describe('Keep a swap request', () => {
  it('closes as kept with the trimmed reply, leaves the Assignment, and enqueues one N8 to the Volunteer', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    const row = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    const [before] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, row.assignmentId));
    signInAs({ userId: ana.volunteer.userId, churchId });

    const response = await keep({
      ministryId,
      swapRequestId: row.id,
      body: { reply: '  Stay with us  ' },
    });

    expect(response.statusCode).toBe(204);
    expect(await statusOf(row.id)).toMatchObject({
      status: 'kept',
      reply: 'Stay with us',
      closedBy: ana.volunteer.userId,
    });
    expect((await statusOf(row.id))?.closedAt).toBeTruthy();
    const [after] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, row.assignmentId));
    expect(after).toEqual(before);
    const sent = await outbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({
      to: { userId: maria.volunteer.userId, churchId },
      data: {
        assignmentId: row.assignmentId,
        leaderName: 'Ana Leader',
        reply: 'Stay with us',
      },
    });
  });

  it('treats a whitespace-only reply as absent', async () => {
    const { churchId, ministryId, maria, base, requestOn } = await seedGraph();
    const row = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    signInAs({ userId: base.adminUserId, churchId });

    const response = await keep({
      ministryId,
      swapRequestId: row.id,
      body: { reply: '   ' },
    });

    expect(response.statusCode).toBe(204);
    expect((await statusOf(row.id))?.reply).toBeNull();
  });

  it('answers 401 unsigned and a concealed 404 for non-leaders and unknown requests, changing nothing', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    const row = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    signInAs({ userId: null, churchId });
    expect((await keep({ ministryId, swapRequestId: row.id })).statusCode).toBe(
      401,
    );
    signInAs({ userId: maria.volunteer.userId, churchId });
    expect((await keep({ ministryId, swapRequestId: row.id })).statusCode).toBe(
      404,
    );
    signInAs({ userId: ana.volunteer.userId, churchId });
    expect(
      (
        await keep({
          ministryId,
          swapRequestId: '99999999-9999-4999-8999-999999999999',
        })
      ).statusCode,
    ).toBe(404);
    expect((await statusOf(row.id))?.status).toBe('open');
    expect(await outbox()).toHaveLength(0);
  });

  it('refuses a closed or Shift-expired request with 409 SWAP_REQUEST_NOT_OPEN and no N8', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    const closed = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    await db
      .update(swapRequest)
      .set({ status: 'covered' })
      .where(eq(swapRequest.id, closed.id));
    const started = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: -1,
    });
    signInAs({ userId: ana.volunteer.userId, churchId });

    for (const id of [closed.id, started.id]) {
      const response = await keep({ ministryId, swapRequestId: id });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('SWAP_REQUEST_NOT_OPEN');
    }
    expect((await statusOf(started.id))?.status).toBe('open');
    expect(await outbox()).toHaveLength(0);
  });

  it('lets concurrent keeps produce one kept transition and one N8', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    const row = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    signInAs({ userId: ana.volunteer.userId, churchId });

    const responses = await Promise.all([
      keep({ ministryId, swapRequestId: row.id, body: { reply: 'a' } }),
      keep({ ministryId, swapRequestId: row.id, body: { reply: 'b' } }),
    ]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    expect(await outbox()).toHaveLength(1);
  });

  it('loses to a covered close that commits first: 409, no N8', async () => {
    const { churchId, ministryId, maria, ana, requestOn } = await seedGraph();
    const row = await requestOn({
      volunteerId: maria.volunteer.id,
      startOffsetHours: 24,
    });
    signInAs({ userId: ana.volunteer.userId, churchId });
    // The covered close is the same conditional close the Assignment actions run.
    await new DrizzleSwapRequestRepository({ db }).closeOpenByAssignment({
      churchId: churchId as never,
      assignmentId: row.assignmentId as never,
      status: 'covered',
    });

    const response = await keep({ ministryId, swapRequestId: row.id });

    expect(response.statusCode).toBe(409);
    expect((await statusOf(row.id))?.status).toBe('covered');
    expect(await outbox()).toHaveLength(0);
  });
});
