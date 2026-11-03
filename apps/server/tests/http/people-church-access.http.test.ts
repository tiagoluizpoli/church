import { identityAudit, member, ministryMembership } from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { m } from '@church/i18n/messages';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PeopleController } from '@/api/controllers/people-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbChurchAccessManager } from '@/application/db-church-access-manager';
import { DbPeopleListManager } from '@/application/db-people-list-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchAccessRepository } from '@/infrastructure/repositories/drizzle-church-access.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzlePeopleListRepository } from '@/infrastructure/repositories/drizzle-people-list.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);
const activeChurchResolver = { resolve: vi.fn() };

const db = schedulingTestDb;
const CHURCH_A = '93333333-3333-4333-8333-333333333333';
const CHURCH_B = '94444444-4444-4444-8444-444444444444';
const NOW = '2026-11-03T12:00:00.000Z';
/** Each request names its own signed-in User, so overlapping requests are independently authenticated. */
const USER_HEADER = 'x-test-user';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  // Real managers, repositories, AuthorityService and PostgreSQL; only session and Active Church are seams.
  const controller = new PeopleController({
    peopleListManager: new DbPeopleListManager({
      peopleListRepository: new DrizzlePeopleListRepository({ db }),
      config: { people: { pageSize: 20, maxPageSize: 50 } },
    }),
    churchAccessManager: new DbChurchAccessManager({
      authorityManager,
      churchAccessRepository: new DrizzleChurchAccessRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: authorityManager }),
    config: { people: { pageSize: 20, maxPageSize: 50 } },
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

interface PersonInput {
  key: string;
  church?: string;
  access?: 'admin' | 'member';
  leads?: string;
}

const memberId = (key: string, church = CHURCH_A) =>
  `m-${key}-${church.slice(0, 2)}`;

async function person({
  key,
  church = CHURCH_A,
  access = 'member',
  leads,
}: PersonInput) {
  await buildUser({
    db,
    id: key,
    name: key,
    email: `${key}@access.test`,
  }).catch(() => undefined);
  await buildChurchMembership({
    db,
    id: memberId(key, church),
    churchId: church,
    userId: key,
    accessLevel: access,
  });
  if (!leads) return;
  const volunteer = await buildVolunteer({ db, churchId: church, userId: key });
  await buildMinistryMembership({
    db,
    churchId: church,
    volunteerId: volunteer.id,
    ministryId: leads,
    ministryAccessLevel: 'leader',
    status: 'active',
    roleIds: [],
  });
}

let worshipId: string;

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: NOW }) });
  mockGetSession.mockImplementation((async ({
    headers,
  }: {
    headers: Headers;
  }) => {
    const id = headers.get(USER_HEADER);
    return id
      ? { user: { id }, session: { activeOrganizationId: null } }
      : null;
  }) as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'acc-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'acc-b',
    timezone: 'UTC',
  });
  worshipId = (await buildMinistry({ db, churchId: CHURCH_A, name: 'Worship' }))
    .id;
  await person({ key: 'ada', access: 'admin' }); // no Volunteer profile
  await person({ key: 'ben', access: 'admin', leads: worshipId });
  await person({ key: 'pat' });
  await person({ key: 'wes', leads: worshipId });
  // A member of both Churches; an admin only in B.
  await person({ key: 'pat', church: CHURCH_B, access: 'admin' });
});

afterEach(() => {
  resetClock();
});

interface ChangeInput {
  as?: string;
  target: string;
  accessLevel: unknown;
  locale?: string;
}

function change({ as, target, accessLevel, locale }: ChangeInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/people/${target}/church-access`,
    headers: as ? { [USER_HEADER]: as } : {},
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
    payload: { accessLevel },
  });
}

async function roleOf(id: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(eq(member.id, id));
  return row?.role;
}

const audits = () => db.select().from(identityAudit);

describe('PATCH /people/:memberId/church-access', () => {
  it('promotes a member and records one complete audit at the server clock', async () => {
    const res = await change({
      as: 'ada',
      target: memberId('pat'),
      accessLevel: 'admin',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      memberId: memberId('pat'),
      accessLevel: 'admin',
      changed: true,
    });
    expect(await roleOf(memberId('pat'))).toBe('admin');
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      churchId: CHURCH_A,
      actorId: 'ada',
      subjectId: 'pat',
      action: 'church_access_changed',
      ministryInvitationId: null,
      reason: null,
      details: {
        churchMembershipId: memberId('pat'),
        before: 'member',
        after: 'admin',
      },
      timestamp: new Date(NOW),
    });
    expect(rows[0]?.correlationId).toEqual(expect.any(String));
    expect(rows[0]?.correlationId.length).toBeGreaterThan(0);
  });

  it('demotes an admin while another remains, leaving Ministry participation intact', async () => {
    const res = await change({
      as: 'ada',
      target: memberId('ben'),
      accessLevel: 'member',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      memberId: memberId('ben'),
      accessLevel: 'member',
      changed: true,
    });
    expect(await roleOf(memberId('ben'))).toBe('member');
    const memberships = await db
      .select({
        level: ministryMembership.ministryAccessLevel,
        status: ministryMembership.status,
      })
      .from(ministryMembership)
      .where(eq(ministryMembership.ministryId, worshipId));
    expect(memberships).toHaveLength(2);
    expect(memberships.every((row) => row.status === 'active')).toBe(true);
    expect(memberships.every((row) => row.level === 'leader')).toBe(true);
    expect(await audits()).toMatchObject([
      {
        actorId: 'ada',
        subjectId: 'ben',
        details: { before: 'admin', after: 'member' },
      },
    ]);
  });

  it('treats the current level as a no-op without an audit', async () => {
    const res = await change({
      as: 'ada',
      target: memberId('ben'),
      accessLevel: 'admin',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      memberId: memberId('ben'),
      accessLevel: 'admin',
      changed: false,
    });
    expect(await audits()).toEqual([]);
  });

  it('refuses to remove the last admin, in the request locale, without writing', async () => {
    await change({ as: 'ada', target: memberId('ben'), accessLevel: 'member' });

    const res = await change({
      as: 'ada',
      target: memberId('ada'),
      accessLevel: 'member',
      locale: 'en',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'LAST_CHURCH_ADMIN',
      message: m.error_last_church_admin({}, { locale: 'en' }),
    });
    expect(await roleOf(memberId('ada'))).toBe('admin');
    expect(await audits()).toHaveLength(1);
  });

  it('lets an admin remove their own access while another admin remains, and refuses their next privileged request', async () => {
    const res = await change({
      as: 'ada',
      target: memberId('ada'),
      accessLevel: 'member',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ changed: true });
    expect(await audits()).toMatchObject([
      { actorId: 'ada', subjectId: 'ada' },
    ]);
    const again = await change({
      as: 'ada',
      target: memberId('pat'),
      accessLevel: 'admin',
    });
    expect(again.statusCode).toBe(403);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${memberId('pat')}`,
      headers: { [USER_HEADER]: 'ada' },
    });
    expect(detail.statusCode).toBe(403);
    expect(await roleOf(memberId('pat'))).toBe('member');
  });

  it('keeps a self-demoted leader on their Ministry scope only', async () => {
    await change({ as: 'ben', target: memberId('ben'), accessLevel: 'member' });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${memberId('wes')}`,
      headers: { [USER_HEADER]: 'ben' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().churchAccess).toBeUndefined();
    expect(detail.json().canChangeChurchAccess).toBe(false);
  });

  it('refuses a non-admin with 403 before looking up the target', async () => {
    for (const target of [memberId('pat'), 'no-such-member']) {
      const res = await change({ as: 'wes', target, accessLevel: 'admin' });
      expect(res.statusCode, target).toBe(403);
      expect(res.json()).toEqual({
        error: 'FORBIDDEN',
        message: m.error_forbidden({}, { locale: testLocale.defaultLocale }),
      });
    }
    expect(await roleOf(memberId('pat'))).toBe('member');
  });

  it('refuses an unauthenticated request with 401', async () => {
    const res = await change({ target: memberId('pat'), accessLevel: 'admin' });
    expect(res.statusCode).toBe(401);
  });

  it('answers 404 for a missing or other-Church member and leaves the other Church untouched', async () => {
    for (const target of ['no-such-member', memberId('pat', CHURCH_B)]) {
      const res = await change({ as: 'ada', target, accessLevel: 'member' });
      expect(res.statusCode, target).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
    }
    await change({ as: 'ada', target: memberId('pat'), accessLevel: 'admin' });
    await change({ as: 'ada', target: memberId('pat'), accessLevel: 'member' });
    expect(await roleOf(memberId('pat', CHURCH_B))).toBe('admin');
    expect(await audits()).toHaveLength(2);
  });

  it('rejects an access level other than member or admin', async () => {
    for (const accessLevel of ['owner', '', undefined]) {
      const res = await change({
        as: 'ada',
        target: memberId('pat'),
        accessLevel,
      });
      expect(res.statusCode, String(accessLevel)).toBe(422);
      expect(res.json().error).toBe('VALIDATION_ERROR');
    }
    expect(await audits()).toEqual([]);
  });

  it('rolls the access change back when the audit cannot be written', async () => {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION test_fail_church_access_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$
    `);
    await db.execute(sql`
      CREATE TRIGGER test_fail_church_access_audit BEFORE INSERT ON identity_audit
      FOR EACH ROW WHEN (NEW.action = 'church_access_changed')
      EXECUTE FUNCTION test_fail_church_access_audit()
    `);
    try {
      const res = await change({
        as: 'ada',
        target: memberId('pat'),
        accessLevel: 'admin',
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe('INTERNAL_SERVER_ERROR');
    } finally {
      await db.execute(
        sql`DROP TRIGGER test_fail_church_access_audit ON identity_audit`,
      );
      await db.execute(sql`DROP FUNCTION test_fail_church_access_audit()`);
    }
    expect(await roleOf(memberId('pat'))).toBe('member');
    expect(await audits()).toEqual([]);
  });

  it("marks the caller's own Church access so the UI can warn before self-demotion", async () => {
    const detail = (target: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/people/${target}`,
        headers: { [USER_HEADER]: 'ada' },
      });

    expect((await detail(memberId('ada'))).json().churchAccess).toEqual({
      accessLevel: 'admin',
      isLastAdmin: false,
      isSelf: true,
    });
    expect((await detail(memberId('ben'))).json().churchAccess.isSelf).toBe(
      false,
    );
  });

  describe('when requests race', () => {
    /**
     * Holds the Church row lock from outside the app until both requests wait
     * on it, so their overlap is guaranteed rather than left to timing.
     */
    async function race(requests: ChangeInput[]) {
      const holder = new pg.Client({
        connectionString: getIntegrationDatabaseUrl(),
      });
      await holder.connect();
      try {
        await holder.query('BEGIN');
        await holder.query(
          'SELECT id FROM church WHERE id = $1 FOR NO KEY UPDATE',
          [CHURCH_A],
        );
        // inject() dispatches only once awaited; start every request now.
        const pending = requests.map((request) =>
          change(request).then((res) => res),
        );
        await waitForLockWaiters({ holder, count: requests.length });
        await holder.query('COMMIT');
        return await Promise.all(pending);
      } finally {
        await holder.end();
      }
    }

    interface WaitForLockWaitersInput {
      holder: pg.Client;
      count: number;
    }

    async function waitForLockWaiters({
      holder,
      count,
    }: WaitForLockWaitersInput) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        // The holder is inside a transaction, which would otherwise see one frozen activity snapshot.
        await holder.query('SELECT pg_stat_clear_snapshot()');
        const { rows } = await holder.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'
             AND query ILIKE '%from "church"%for no key update%'`,
        );
        if (rows[0].waiting >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`fewer than ${count} requests reached the Church lock`);
    }

    const adminCount = async () =>
      (await db.select().from(member)).filter(
        (row) => row.organizationId === CHURCH_A && row.role === 'admin',
      ).length;

    it('keeps one admin when two admins demote themselves at once', async () => {
      const responses = await race([
        { as: 'ada', target: memberId('ada'), accessLevel: 'member' },
        { as: 'ben', target: memberId('ben'), accessLevel: 'member' },
      ]);

      expect(responses.map((res) => res.statusCode).sort()).toEqual([200, 409]);
      expect(await adminCount()).toBe(1);
      expect(await audits()).toHaveLength(1);
    });

    it('refuses the waiting request of an admin the winner demoted', async () => {
      const responses = await race([
        { as: 'ada', target: memberId('ben'), accessLevel: 'member' },
        { as: 'ben', target: memberId('ada'), accessLevel: 'member' },
      ]);

      expect(responses.map((res) => res.statusCode).sort()).toEqual([200, 403]);
      expect(await adminCount()).toBe(1);
      const [audit] = await audits();
      const winner = responses.find((res) => res.statusCode === 200);
      // The loser was demoted by the winner and could not act afterwards.
      expect(audit?.subjectId).not.toBe(audit?.actorId);
      expect(winner?.json().changed).toBe(true);
    });

    it('stops a demoted actor queued behind its own demotion from promoting anyone', async () => {
      const responses = await race([
        { as: 'ada', target: memberId('ben'), accessLevel: 'member' },
        { as: 'ben', target: memberId('pat'), accessLevel: 'admin' },
      ]);

      const byActor = responses.map((res) => res.statusCode);
      // Either order is safe: ben acted before demotion, or was refused after it.
      expect(byActor[0]).toBe(200);
      expect([200, 403]).toContain(byActor[1]);
      expect(await roleOf(memberId('ben'))).toBe('member');
      if (byActor[1] === 403) {
        expect(await roleOf(memberId('pat'))).toBe('member');
      }
    });
  });
});
