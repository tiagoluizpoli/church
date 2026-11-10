import { appConfig } from '@church/app-config';
import {
  assignment,
  ministryMembership,
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
import { SwapRequestController } from '@/api/controllers/swap-request-controller';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
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

type ManagerDeps = ConstructorParameters<typeof DbSwapRequestManager>[0];

function makeManager(overrides: Partial<ManagerDeps> = {}) {
  const plainEventRepo = new DrizzleEventRepository({ db });
  const ministryRepo = new DrizzleMinistryRepository({ db });
  return new DbSwapRequestManager({
    swapRequestRepo: new DrizzleSwapRequestRepository({ db }),
    assignmentRepo: new DrizzleAssignmentRepository({ db }),
    participationRepo: new DrizzleMinistryParticipationRepository({ db }),
    shiftRepo: new DrizzleShiftRepository({ db }),
    eventRepo: plainEventRepo,
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
      eventRepository: plainEventRepo,
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      ministryRepository: ministryRepo,
    }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    config: appConfig,
    ...overrides,
  });
}

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const activeChurchResolver = new DbActiveChurchResolver({
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
  });
  const controllers = [
    new SwapRequestController({
      activeChurchResolver,
      swapRequestManager: makeManager(),
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

const alertsFor = async (_churchId: string) =>
  (await db.select().from(outboxMessage)).filter(
    (row) => (row.payload as { kind?: string }).kind === 'swap_request',
  );

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

  it('is a concealed 404 and enqueues nothing when the Assignment is removed while the raise waits', async () => {
    const { mine, churchId } = await seedGraph();
    // A removal that holds the Assignment row until released.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const removal = db.transaction(async (tx) => {
      await tx.delete(assignment).where(eq(assignment.id, mine.id));
      locked();
      await held;
    });
    await lockTaken;
    const pending = raise(mine.id, { note: 'late' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await removal;
    const response = await pending;
    expect(response.statusCode).toBe(404);
    expect(await db.select().from(swapRequest)).toHaveLength(0);
    expect(await alertsFor(churchId)).toHaveLength(0);
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
    const { noteMaxLength } = appConfig.swapRequest;
    const note = 'x'.repeat(noteMaxLength);
    expect((await raise(mine.id, { note })).statusCode).toBe(201);
  });

  it('is 400 naming the limit when the note is too long', async () => {
    const { mine } = await seedGraph();
    const { noteMaxLength: max } = appConfig.swapRequest;
    const response = await raise(mine.id, { note: 'x'.repeat(max + 1) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('SWAP_REQUEST_NOTE_TOO_LONG');
    expect(response.json().message).toContain(String(max));
    expect(await db.select().from(swapRequest)).toHaveLength(0);
  });
});

describe('The caller’s swap request state on the Assignment detail', () => {
  const detail = async (id: string) =>
    (await app.inject({ method: 'GET', url: `${ROOT}/${id}` })).json()
      .swapRequest;
  const closeAs = (status: string, reply?: string) =>
    db.update(swapRequest).set({ status, reply, closedAt: new Date() });

  it('is null when nothing was raised', async () => {
    const { mine } = await seedGraph();
    expect(await detail(mine.id)).toBeNull();
  });

  it.each([
    ['withdrawn', undefined],
    ['covered', undefined],
    ['kept', 'Please stay on'],
  ])('reports a %s request', async (status, reply) => {
    const { mine } = await seedGraph();
    await raise(mine.id, { note: 'João' });
    await closeAs(status, reply);
    expect(await detail(mine.id)).toMatchObject({
      status,
      note: 'João',
      reply: reply ?? null,
    });
  });

  it('reads an open request as expired once its Shift has started, writing nothing', async () => {
    const { mine, me, churchId } = await seedGraph({ year: 2020 });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: mine.id,
      status: 'open',
      raisedBy: me.volunteer.userId,
    });
    expect(await detail(mine.id)).toMatchObject({ status: 'expired' });
    const [row] = await db.select().from(swapRequest);
    expect(row?.status).toBe('open');
  });

  it('never shows another Volunteer’s request', async () => {
    const { theirs } = await seedGraph();
    expect(
      (await app.inject({ method: 'GET', url: `${ROOT}/${theirs.id}` }))
        .statusCode,
    ).toBe(404);
  });
});

describe('N7 swap request alert enqueue', () => {
  const alerts = async () =>
    (await db.select().from(outboxMessage)).filter(
      (row) => (row.payload as { kind?: string }).kind === 'swap_request',
    );

  it('enqueues one outbox row for the leader, who is also a ChurchAdmin, with frozen facts', async () => {
    const { mine, churchId } = await seedGraph();
    const response = await raise(mine.id, { note: 'João will cover' });
    const rows = await alerts();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      to: { userId: 'sched-admin-user', churchId },
      data: {
        swapRequestId: response.json().id,
        volunteerName: 'Maria Souza Lima',
        note: 'João will cover',
        ministryName: 'Scheduling Ministry A',
        shift: {
          eventTitle: 'Sunday Service',
          roleName: 'Teacher',
          startsAt: '2030-10-13T13:00:00.000Z',
        },
      },
    });
  });

  it('alerts every ChurchAdmin, once each, when the Ministry has no leader', async () => {
    const { mine, churchId } = await seedGraph();
    await db
      .update(ministryMembership)
      .set({ ministryAccessLevel: 'volunteer' });
    await buildUser({
      db,
      id: 'second-admin',
      name: 'Second',
      email: 's@t.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: 'second-admin',
      accessLevel: 'admin',
    });
    await raise(mine.id);
    const recipients = (await alerts()).map(
      (row) => (row.payload as { to: { userId: string } }).to.userId,
    );
    expect(recipients.sort()).toEqual(['sched-admin-user', 'second-admin']);
  });

  it('enqueues nothing when the raise is refused', async () => {
    const { theirs } = await seedGraph();
    await raise(theirs.id);
    expect(await alerts()).toHaveLength(0);
  });
});

const withdraw = (id: string) =>
  app.inject({ method: 'DELETE', url: `${ROOT}/${id}/swap-requests/current` });

describe('Withdraw a swap request', () => {
  it('closes the open request as withdrawn, leaves the Assignment alone and notifies nobody', async () => {
    const { mine, me } = await seedGraph();
    await raise(mine.id, { note: 'x' });
    const outboxBefore = await db.select().from(outboxMessage);
    const response = await withdraw(mine.id);
    expect(response.statusCode).toBe(204);
    const [row] = await db.select().from(swapRequest);
    expect(row).toMatchObject({
      status: 'withdrawn',
      closedBy: me.volunteer.userId,
    });
    expect(row?.closedAt).toBeInstanceOf(Date);
    const [after] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, mine.id));
    expect(after).toMatchObject({ status: 'confirmed' });
    expect(await db.select().from(outboxMessage)).toHaveLength(
      outboxBefore.length,
    );
    const detail = await app.inject({
      method: 'GET',
      url: `${ROOT}/${mine.id}`,
    });
    expect(detail.json().swapRequest?.status).not.toBe('open');
    // The Assignment can be raised on again.
    expect((await raise(mine.id)).statusCode).toBe(201);
  });

  it('is 409 SWAP_REQUEST_NOT_OPEN when already withdrawn or never raised', async () => {
    const { mine } = await seedGraph();
    expect((await withdraw(mine.id)).json().error).toBe(
      'SWAP_REQUEST_NOT_OPEN',
    );
    await raise(mine.id);
    await withdraw(mine.id);
    const response = await withdraw(mine.id);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('SWAP_REQUEST_NOT_OPEN');
  });

  it('is 409 when the request was covered meanwhile', async () => {
    const { mine } = await seedGraph();
    await raise(mine.id);
    await db.update(swapRequest).set({ status: 'covered' });
    expect((await withdraw(mine.id)).statusCode).toBe(409);
    expect((await db.select().from(swapRequest))[0]?.status).toBe('covered');
  });

  it('is 409 when the request is closed between the read and the close', async () => {
    const { mine } = await seedGraph();
    await raise(mine.id);
    const real = new DrizzleSwapRequestRepository({ db });
    const racing = Object.create(real) as DrizzleSwapRequestRepository;
    // Another actor covers the request right after the withdraw read it open.
    racing.findOpenByAssignment = async (input) => {
      const open = await real.findOpenByAssignment(input);
      await db.update(swapRequest).set({ status: 'covered' });
      return open;
    };
    const manager = makeManager({ swapRequestRepo: racing });
    const [row] = await db.select().from(swapRequest);
    const { churchId, assignmentId, raisedBy } = row as typeof row & {
      raisedBy: string;
    };
    await expect(
      manager.withdraw({
        churchId: churchId as never,
        userId: raisedBy as never,
        assignmentId: assignmentId as never,
      }),
    ).rejects.toMatchObject({ code: 'SWAP_REQUEST_NOT_OPEN' });
    expect((await db.select().from(swapRequest))[0]?.status).toBe('covered');
  });

  it('is 401 unsigned and a concealed 404 for another Volunteer’s or unknown Assignment', async () => {
    const { mine, theirs } = await seedGraph();
    await raise(mine.id);
    expect((await withdraw(theirs.id)).statusCode).toBe(404);
    expect(
      (await withdraw('99999999-9999-4999-8999-999999999999')).statusCode,
    ).toBe(404);
    getSession.mockResolvedValue(null);
    expect((await withdraw(mine.id)).statusCode).toBe(401);
    expect((await db.select().from(swapRequest))[0]?.status).toBe('open');
  });
});
