import { ministry, role } from '@church/db';
import { m } from '@church/i18n/messages';
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
import { MinistryRoleController } from '@/api/controllers/ministry-role-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryRoleManager } from '@/application/db-ministry-role-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { testSessionGateway } from '@/tests/test-support/session-gateway';

// #1225: the Role routes answer an archived Ministry as 404, like the Sector
// and Usual setup routes. The Role manager checks the Ministry is active.

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };

const db = schedulingTestDb;
const CHURCH = '73333333-3333-4333-8333-333333333333';
const PT_BR = { locale: 'pt-BR' as const };

let app: FastifyTypedInstance;

beforeAll(async () => {
  const ministryRepository = new DrizzleMinistryRepository({ db });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new MinistryRoleController({
    sessionGateway: testSessionGateway(),
    ministryRoleManager: new DbMinistryRoleManager({
      ministryRepository,
      roleRepository: new DrizzleRoleRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository,
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

type Persona = 'admin' | 'leader';

interface Fixture {
  ministryId: string;
  roleId: string;
  users: Record<Persona, PersonaUser>;
}

interface PersonaUser {
  userId: string;
  volunteerId: string | null;
}

let fixture: Fixture;

async function seed(): Promise<Fixture> {
  await buildChurch({
    db,
    id: CHURCH,
    name: 'Archived',
    slug: 'roles-archived',
    timezone: 'UTC',
  });
  const old = await buildMinistry({ db, churchId: CHURCH, name: 'Old' });
  const keys = await buildRole({
    db,
    churchId: CHURCH,
    ministryId: old.id,
    name: 'Keys',
  });
  await buildUser({ db, id: 'archived-admin', name: 'admin', email: 'a@x.t' });
  await buildChurchMembership({
    db,
    churchId: CHURCH,
    userId: 'archived-admin',
    accessLevel: 'admin',
  });
  await buildUser({ db, id: 'archived-leader', name: 'lead', email: 'l@x.t' });
  await buildChurchMembership({
    db,
    churchId: CHURCH,
    userId: 'archived-leader',
    accessLevel: 'member',
  });
  const volunteer = await buildVolunteer({
    db,
    churchId: CHURCH,
    userId: 'archived-leader',
  });
  await buildMinistryMembership({
    db,
    churchId: CHURCH,
    volunteerId: volunteer.id,
    ministryId: old.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, old.id));
  return {
    ministryId: old.id,
    roleId: keys.id,
    users: {
      admin: { userId: 'archived-admin', volunteerId: null },
      leader: { userId: 'archived-leader', volunteerId: volunteer.id },
    },
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
  fixture = await seed();
});

function signIn(persona: Persona) {
  const { userId, volunteerId } = fixture.users[persona];
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH,
    volunteerId,
    autoSelected: false,
  });
}

function requests() {
  const base = `/api/v1/ministries/${fixture.ministryId}/roles`;
  return [
    { method: 'GET', url: base },
    { method: 'POST', url: base, payload: { name: 'New' } },
    {
      method: 'PATCH',
      url: `${base}/${fixture.roleId}`,
      payload: { name: 'X' },
    },
    { method: 'POST', url: `${base}/${fixture.roleId}/archive` },
  ] as const;
}

async function storedRoles() {
  return db
    .select({ name: role.name, archivedAt: role.archivedAt })
    .from(role)
    .where(eq(role.ministryId, fixture.ministryId));
}

describe('Role routes of an archived Ministry', () => {
  it('answer an admin 404 on every route, changing nothing', async () => {
    signIn('admin');

    for (const request of requests()) {
      const res = await app.inject(request as never);
      expect(res.statusCode, `${request.method} ${request.url}`).toBe(404);
      expect(res.json()).toEqual({
        error: 'NOT_FOUND',
        message: m.error_not_found({}, PT_BR),
      });
    }
    expect(await storedRoles()).toEqual([{ name: 'Keys', archivedAt: null }]);
  });

  it('answer its only leader 403: leading no active Ministry is no function', async () => {
    signIn('leader');

    for (const request of requests()) {
      const res = await app.inject(request as never);
      expect(res.statusCode, `${request.method} ${request.url}`).toBe(403);
      expect(res.json()).toEqual({
        error: 'FORBIDDEN',
        message: m.error_forbidden({}, PT_BR),
      });
    }
    expect(await storedRoles()).toEqual([{ name: 'Keys', archivedAt: null }]);
  });
});
