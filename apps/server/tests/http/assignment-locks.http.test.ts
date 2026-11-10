import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  assignment,
  ministryParticipation,
  outboxMessage,
  scheduleLastTold,
  session,
  shift,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { env } from '@church/env/server';
import { parseInstant, setTestClock } from '@church/time';
import { makeSignature } from 'better-auth/crypto';
import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { AssignController } from '@/api/controllers/assign-controller';
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildSector } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import { buildVolunteerWithMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const notifications = new ChurchNotifications({
    outboxRepository: new DrizzleOutboxRepository({ db }),
  });
  const managers = createSchedulingManagers({ notifications });
  const authorityGuard = new AuthorityGuard({
    manager: new DbAuthorityManager({
      actorRepository,
      scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
      eventRepository: new DrizzleEventRepository({ db }),
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      ministryRepository,
    }),
  });
  const activeChurchResolver = new DbActiveChurchResolver({
    actorRepository,
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork,
  });
  // Move confirm races Assignment creation through the real routes.
  const adminController = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: {} as never,
    ministryManager: {} as never,
    planningEventManager: new DbPlanningEventManager({
      cycleRepository: new DrizzleCycleRepository({ db }),
      eventRepository: new DrizzlePlanningEventRepository({ db }),
      templateRepository: new DrizzleEventTemplateRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork,
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      assignmentRepository: new DrizzleAssignmentRepository({ db }),
      auditRepository: new DrizzleAssignmentAuditRepository({ db }),
      swapRequestRepository: new DrizzleSwapRequestRepository({ db }),
      recipients: new ChurchRecipients({
        churchRepository: new DrizzleChurchRepository({ db }),
        volunteerRepository: new DrizzleVolunteerRepository({ db }),
      }),
      notifications,
    }),
    activeChurchResolver,
    authorityGuard,
  });
  const controller = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver,
    authorityGuard,
    config: appConfig,
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
      instance.register(adminController.registerRoutes.bind(adminController), {
        prefix: adminController.prefix,
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
  await resetSchedulingPhase3Db();
});

async function seedLockedAssignment() {
  const seed = await seedSchedulingPhase3Base();
  const token = randomUUID();
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId: seed.adminUserId,
    activeOrganizationId: seed.churchAId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const signature = await makeSignature(token, env.BETTER_AUTH_SECRET);
  const headers = { cookie: `better-auth.session_token=${token}.${signature}` };
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'August',
    startDate: new Date('2026-08-01Z'),
    endDate: new Date('2026-08-31Z'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Sunday',
    start: new Date('2026-08-02T09:00:00Z'),
    end: new Date('2026-08-02T11:00:00Z'),
    status: 'scheduled',
  });
  const role = await seedRole({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Greeter',
  });
  const shift = await seedShift({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    label: 'Morning',
    startTime: graph.eventTimeBlock.startTime,
    endTime: graph.eventTimeBlock.endTime,
  });
  const source = await seedRequirement({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 2,
  });
  const sector = await buildSector({
    db,
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Side Door',
  });
  const target = await seedRequirement({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    sectorId: sector.id,
    peopleNeeded: 2,
  });
  const volunteers = [];
  for (const name of ['Original', 'Replacement']) {
    volunteers.push(
      await buildVolunteerWithMembership({
        db,
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name,
        email: `${randomUUID()}@test.com`,
        roleIds: [role.id],
      }),
    );
  }
  const [original, replacement] = volunteers;
  if (!original || !replacement) throw new Error('Missing Volunteer fixture');
  const current = await buildAssignment({
    db,
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    volunteerId: original.volunteer.id,
    shiftRequirementId: source.id,
    status: 'confirmed',
  });
  setTestClock({ instant: parseInstant({ value: '2026-08-02T08:59:59Z' }) });
  return {
    ...seed,
    cycle,
    graph,
    shift,
    source,
    target,
    current,
    headers,
    replacementId: replacement.volunteer.id,
  };
}

it('reverting a replacement and recreating a placement leaves no unsent changes', async () => {
  const seed = await seedLockedAssignment();
  await db
    .update(ministryParticipation)
    .set({ state: 'assigning' })
    .where(eq(ministryParticipation.id, seed.graph.participation.id));
  const base = `/api/v1/assign/cycles/${seed.cycle.id}`;
  const query = `?ministryId=${seed.ministryAId}`;
  const publish = await app.inject({
    method: 'POST',
    url: `${base}/publish${query}`,
    headers: seed.headers,
    payload: { confirmBelowFull: true },
  });
  expect(publish.statusCode).toBe(200);
  const beforeSnapshots = await db.select().from(scheduleLastTold);
  const beforeOutbox = await db.select().from(outboxMessage);
  const replace = async (id: string, volunteerId: string) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${id}/reassign`,
      headers: seed.headers,
      payload: { volunteerId },
    });
  const first = await replace(seed.current.id, seed.replacementId);
  expect(first.statusCode).toBe(200);
  const second = await replace(first.json().id, seed.current.volunteerId);
  expect(second.statusCode).toBe(200);
  const assertNoChanges = async () => {
    const read = await app.inject({
      method: 'GET',
      url: `${base}/builder${query}`,
      headers: seed.headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().affectedVolunteerCount).toBe(0);
    const send = await app.inject({
      method: 'POST',
      url: `${base}/send-updates${query}`,
      headers: seed.headers,
    });
    expect(send.statusCode).toBe(409);
    expect(send.json().error).toBe('NO_UNSENT_CHANGES');
    expect(await db.select().from(scheduleLastTold)).toEqual(beforeSnapshots);
    expect(await db.select().from(outboxMessage)).toEqual(beforeOutbox);
  };
  await assertNoChanges();
  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/v1/assign/assignments/${second.json().id}`,
    headers: seed.headers,
  });
  expect(removed.statusCode).toBe(204);
  const recreated = await app.inject({
    method: 'POST',
    url: `/api/v1/assign/shifts/${seed.shift.id}/assignments`,
    headers: seed.headers,
    payload: {
      volunteerId: seed.current.volunteerId,
      shiftRequirementId: seed.source.id,
    },
  });
  expect(recreated.statusCode).toBe(201);
  await assertNoChanges();
});

async function readBackendPid(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const pid = rows[0]?.pid;
  if (pid === undefined) throw new Error('Missing PostgreSQL backend id');
  return pid;
}

// Real PostgreSQL locks establish the interleaving; no timed delays or replaced collaborators.
async function waitForBlockedRequest(
  client: pg.Client,
  blockerPid: number,
  /** Stops waiting, answering undefined, once the request settled unblocked. */
  settled: () => boolean = () => false,
): Promise<number | undefined> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (settled()) return undefined;
    await client.query('SELECT pg_stat_clear_snapshot()');
    const result = await client.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock'
       AND $1 = ANY(pg_blocking_pids(pid))`,
      [blockerPid],
    );
    if (result.rows[0]) return result.rows[0].pid;
  }
  throw new Error('HTTP mutation did not reach the expected PostgreSQL lock');
}

for (const mutation of ['create', 'move', 'reassign', 'remove'] as const) {
  it(`${mutation} refuses a Shift that starts while waiting for the participation lock`, async () => {
    const seed = await seedLockedAssignment();
    const blocker = new pg.Client({
      connectionString: getIntegrationDatabaseUrl(),
    });
    await blocker.connect();
    const requests: Promise<unknown>[] = [];
    try {
      await blocker.query('BEGIN');
      const blockerPid = await readBackendPid(blocker);
      await blocker.query(
        'SELECT id FROM ministry_participation WHERE id = $1 FOR UPDATE',
        [seed.graph.participation.id],
      );
      const response = app.inject({
        method:
          mutation === 'create'
            ? 'POST'
            : mutation === 'remove'
              ? 'DELETE'
              : 'PATCH',
        url:
          mutation === 'create'
            ? `/api/v1/assign/shifts/${seed.shift.id}/assignments`
            : `/api/v1/assign/assignments/${seed.current.id}${mutation === 'remove' ? '' : `/${mutation}`}`,
        headers: seed.headers,
        payload:
          mutation === 'create'
            ? {
                volunteerId: seed.replacementId,
                shiftRequirementId: seed.source.id,
              }
            : mutation === 'move'
              ? { shiftRequirementId: seed.target.id }
              : mutation === 'reassign'
                ? { volunteerId: seed.replacementId }
                : undefined,
      });
      // Start injection before waiting for PostgreSQL's externally observed lock.
      const pending = response.then((result) => result);
      requests.push(pending);
      await waitForBlockedRequest(blocker, blockerPid);
      setTestClock({
        instant: parseInstant({ value: '2026-08-02T09:00:00Z' }),
      });
      await blocker.query('COMMIT');
      const result = await pending;
      expect(result.statusCode).toBe(409);
      expect(result.json()).toMatchObject({ error: 'SHIFT_STARTED' });
      const board = await app.inject({
        method: 'GET',
        headers: seed.headers,
        url: `/api/v1/assign/cycles/${seed.cycle.id}/builder?ministryId=${seed.ministryAId}`,
      });
      expect(board.statusCode).toBe(200);
      expect(
        board.json().events[0].eventTimeBlocks[0].shifts[0].assignments,
      ).toEqual([
        expect.objectContaining({
          id: seed.current.id,
          shiftRequirementId: seed.source.id,
          volunteerId: seed.current.volunteerId,
        }),
      ]);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled(requests);
      await blocker.end();
    }
  });
}

it('reassign keeps the Sector committed by a concurrent successful move', async () => {
  const seed = await seedLockedAssignment();
  const blocker = new pg.Client({
    connectionString: getIntegrationDatabaseUrl(),
  });
  await blocker.connect();
  const pending: Promise<unknown>[] = [];
  try {
    await blocker.query('BEGIN');
    const blockerPid = await readBackendPid(blocker);
    // Hold the Assignment row so the real move pauses with its Participation lock held.
    await blocker.query('SELECT id FROM assignment WHERE id = $1 FOR UPDATE', [
      seed.current.id,
    ]);
    const move = app
      .inject({
        method: 'PATCH',
        url: `/api/v1/assign/assignments/${seed.current.id}/move`,
        headers: seed.headers,
        payload: { shiftRequirementId: seed.target.id },
      })
      .then((result) => result);
    pending.push(move);
    const movePid = await waitForBlockedRequest(blocker, blockerPid);
    if (movePid === undefined) throw new Error('Move never paused');
    const reassign = app
      .inject({
        method: 'PATCH',
        url: `/api/v1/assign/assignments/${seed.current.id}/reassign`,
        headers: seed.headers,
        payload: { volunteerId: seed.replacementId },
      })
      .then((result) => result);
    pending.push(reassign);
    await waitForBlockedRequest(blocker, movePid);
    await blocker.query('COMMIT');
    const moved = await move;
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({
      id: seed.current.id,
      shiftRequirementId: seed.target.id,
    });
    const reassigned = await reassign;
    expect(reassigned.statusCode).toBe(200);
    expect(reassigned.json()).toMatchObject({
      volunteerId: seed.replacementId,
      shiftRequirementId: seed.target.id,
    });
    const board = await app.inject({
      method: 'GET',
      headers: seed.headers,
      url: `/api/v1/assign/cycles/${seed.cycle.id}/builder?ministryId=${seed.ministryAId}`,
    });
    expect(board.statusCode).toBe(200);
    expect(
      board.json().events[0].eventTimeBlocks[0].shifts[0].assignments,
    ).toEqual([
      expect.objectContaining({
        id: reassigned.json().id,
        shiftRequirementId: seed.target.id,
        volunteerId: seed.replacementId,
      }),
    ]);
  } finally {
    await blocker.query('ROLLBACK');
    await Promise.allSettled(pending);
    await blocker.end();
  }
});

/** Every pair of active Assignments of one Volunteer whose Shifts strictly overlap. */
async function overlappingActivePairs() {
  const other = alias(assignment, 'other_assignment');
  const otherShift = alias(shift, 'other_shift');
  const active = ['draft', 'pending', 'confirmed'] as const;
  return db
    .select({ left: assignment.id, right: other.id })
    .from(assignment)
    .innerJoin(shift, eq(shift.id, assignment.shiftId))
    .innerJoin(
      other,
      and(
        eq(other.volunteerId, assignment.volunteerId),
        ne(other.id, assignment.id),
      ),
    )
    .innerJoin(otherShift, eq(otherShift.id, other.shiftId))
    .where(
      and(
        inArray(assignment.status, [...active]),
        inArray(other.status, [...active]),
        lt(shift.startTime, otherShift.endTime),
        lt(otherShift.startTime, shift.endTime),
      ),
    );
}

/**
 * The Replacement serves the 2 August Shift that moves onto 9 August
 * 09:00–11:00, and is being added to the 9 August Shift at that same time:
 * a Shift outside the moved scope, whose Participation the move never locks.
 */
async function seedMoveRace() {
  const seed = await seedLockedAssignment();
  const later = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: seed.cycle.id,
    ministryId: seed.ministryAId,
    title: 'Next Sunday',
    start: new Date('2026-08-09T09:00:00Z'),
    end: new Date('2026-08-09T11:00:00Z'),
    status: 'scheduled',
  });
  const laterShift = await seedShift({
    churchId: seed.churchAId,
    participationId: later.participation.id,
    eventTimeBlockId: later.eventTimeBlock.id,
    label: 'Morning',
    startTime: later.eventTimeBlock.startTime,
    endTime: later.eventTimeBlock.endTime,
  });
  const laterRequirement = await seedRequirement({
    churchId: seed.churchAId,
    participationId: later.participation.id,
    shiftId: laterShift.id,
    roleId: seed.source.roleId,
    peopleNeeded: 1,
  });
  const moving = await buildAssignment({
    db,
    churchId: seed.churchAId,
    participationId: seed.graph.participation.id,
    shiftId: seed.shift.id,
    roleId: seed.source.roleId,
    volunteerId: seed.replacementId,
    shiftRequirementId: seed.source.id,
    status: 'confirmed',
  });
  return { ...seed, laterShift, laterRequirement, moving };
}

for (const [scope, first] of [
  ['event', 'move'],
  ['event', 'create'],
  ['eventTimeBlock', 'move'],
  ['eventTimeBlock', 'create'],
] as const) {
  it(`${scope} move confirm and Assignment creation never store an overlapping pair when ${first} goes first`, async () => {
    const seed = await seedMoveRace();
    const blocker = new pg.Client({
      connectionString: getIntegrationDatabaseUrl(),
    });
    await blocker.connect();
    const pending: Promise<unknown>[] = [];
    const confirmMove = () =>
      app
        .inject({
          method: 'POST',
          url: `/api/v1/admin/cycles/${seed.cycle.id}/events/${seed.graph.event.id}${
            scope === 'event'
              ? ''
              : `/event-time-blocks/${seed.graph.eventTimeBlock.id}`
          }/move`,
          headers: seed.headers,
          payload: { start: '2026-08-09T09:00:00.000Z' },
        })
        .then((result) => result);
    const createAssignment = () =>
      app
        .inject({
          method: 'POST',
          url: `/api/v1/assign/shifts/${seed.laterShift.id}/assignments`,
          headers: seed.headers,
          payload: {
            volunteerId: seed.replacementId,
            shiftRequirementId: seed.laterRequirement.id,
          },
        })
        .then((result) => result);
    try {
      await blocker.query('BEGIN');
      const blockerPid = await readBackendPid(blocker);
      // Real row locks pause the first request after it read what it decides
      // on: the move at its Shift write, the creation at its Assignment insert.
      await blocker.query(
        first === 'move'
          ? 'SELECT id FROM shift WHERE id = $1 FOR UPDATE'
          : 'SELECT id FROM shift_requirement WHERE id = $1 FOR UPDATE',
        [first === 'move' ? seed.shift.id : seed.laterRequirement.id],
      );
      const firstRequest =
        first === 'move' ? confirmMove() : createAssignment();
      pending.push(firstRequest);
      const firstPid = await waitForBlockedRequest(blocker, blockerPid);
      if (firstPid === undefined) throw new Error('First request never paused');
      const secondRequest =
        first === 'move' ? createAssignment() : confirmMove();
      pending.push(secondRequest);
      let secondSettled = false;
      void secondRequest.finally(() => {
        secondSettled = true;
      });
      // Queues behind the shared Church lock; without it the second request
      // commits here, deciding on the first one's uncommitted state.
      await waitForBlockedRequest(blocker, firstPid, () => secondSettled);
      await blocker.query('COMMIT');
      const [move, create] =
        first === 'move'
          ? [await firstRequest, await secondRequest]
          : [await secondRequest, await firstRequest];

      expect(move.statusCode).toBe(200);
      expect(await overlappingActivePairs()).toEqual([]);
      if (first === 'move') {
        // Created after the move: the moved Shift now overlaps the new one.
        expect(create.statusCode).toBe(409);
        expect(create.json()).toMatchObject({
          error: 'HARD_CONSTRAINT_VIOLATION',
          reason: 'DUPLICATE_ASSIGNMENT',
        });
        expect(move.json().withdrawn).toEqual([]);
      } else {
        // Created before the move: confirm withdraws the moved Assignment.
        expect(create.statusCode).toBe(201);
        expect(move.json().withdrawn).toEqual([
          expect.objectContaining({ assignmentId: seed.moving.id }),
        ]);
      }
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled(pending);
      await blocker.end();
    }
  });
}
