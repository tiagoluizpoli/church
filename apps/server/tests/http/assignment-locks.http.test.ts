import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  ministryParticipation,
  outboxMessage,
  scheduleLastTold,
  session,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { env } from '@church/env/server';
import { parseInstant, setTestClock } from '@church/time';
import { makeSignature } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { AssignController } from '@/api/controllers/assign-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
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
  const controller = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork,
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
        scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
        eventRepository: new DrizzleEventRepository({ db }),
        eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
        ministryRepository,
      }),
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
): Promise<number> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
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
