import { randomUUID } from 'node:crypto';
import { ministry } from '@church/db';
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
import { MinistryController } from '@/api/controllers/ministry-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
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

let app: FastifyTypedInstance;

beforeAll(async () => {
  const db = schedulingTestDb;
  const ministryRepo = new DrizzleMinistryRepository({ db });
  app = await createFastify({ locale: testLocale });
  // Real manager, repositories and AuthorityService; only the session and
  // Active Church selection are seams.
  const controller = new MinistryController({
    ministryManager: new DbMinistryManager({
      ministryRepo,
      volunteerRepo: new DrizzleVolunteerRepository({ db }),
    }),
    ministryInvitationManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: ministryRepo,
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

const CHURCH_A = '61111111-1111-4111-8111-111111111111';
const CHURCH_B = '62222222-2222-4222-8222-222222222222';

/** `leader` leads only Worship; `otherLeader` leads only Kids. */
type Persona = 'admin' | 'leader' | 'otherLeader' | 'volunteer' | 'member';

interface PersonaRecord {
  userId: string;
  volunteerId: string | null;
}

interface Fixture {
  personas: Record<Persona, PersonaRecord>;
  worshipId: string;
  kidsId: string;
  archivedId: string;
  foreignId: string;
}

let fixture: Fixture;

interface BuildPersonaInput {
  key: Persona;
  churchAccess: 'admin' | 'member';
  membership?: { ministryId: string; level: 'leader' | 'volunteer' };
}

async function buildPersona({
  key,
  churchAccess,
  membership,
}: BuildPersonaInput): Promise<PersonaRecord> {
  const db = schedulingTestDb;
  const userId = `ministry-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@test.com` });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId,
    accessLevel: churchAccess,
  });
  if (!membership) return { userId, volunteerId: null };
  const volunteer = await buildVolunteer({ db, churchId: CHURCH_A, userId });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: volunteer.id,
    ministryId: membership.ministryId,
    ministryAccessLevel: membership.level,
    roleIds: [],
  });
  return { userId, volunteerId: volunteer.id };
}

async function seed(): Promise<Fixture> {
  const db = schedulingTestDb;
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'ministry-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'ministry-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'kids' });
  const archived = await buildMinistry({ db, churchId: CHURCH_A, name: 'Old' });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archived.id));
  const foreign = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  return {
    worshipId: worship.id,
    kidsId: kids.id,
    archivedId: archived.id,
    foreignId: foreign.id,
    personas: {
      admin: await buildPersona({ key: 'admin', churchAccess: 'admin' }),
      leader: await buildPersona({
        key: 'leader',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'leader' },
      }),
      otherLeader: await buildPersona({
        key: 'otherLeader',
        churchAccess: 'member',
        membership: { ministryId: kids.id, level: 'leader' },
      }),
      volunteer: await buildPersona({
        key: 'volunteer',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'volunteer' },
      }),
      member: await buildPersona({ key: 'member', churchAccess: 'member' }),
    },
  };
}

function signIn(persona: Persona) {
  const { userId, volunteerId } = fixture.personas[persona];
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId,
    autoSelected: false,
  });
}

beforeEach(async () => {
  fixture = await seed();
});

const PT_BR = { locale: 'pt-BR' as const };

function list() {
  return app.inject({ method: 'GET', url: '/api/v1/ministries' });
}

function detail(ministryId: string) {
  return app.inject({ method: 'GET', url: `/api/v1/ministries/${ministryId}` });
}

function create(payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/ministries',
    payload: payload as never,
  });
}

function rename(ministryId: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/ministries/${ministryId}`,
    payload: payload as never,
  });
}

async function listedNames() {
  const res = await list();
  return res
    .json()
    .ministries.map((item: { name: string }) => item.name) as string[];
}

describe('GET /ministries', () => {
  it('lists every active Church Ministry alphabetically, ignoring case, for an admin without a Volunteer profile', async () => {
    signIn('admin');

    expect(await listedNames()).toEqual(['kids', 'Worship']);
  });

  it('lists a one-row list for a leader of one Ministry', async () => {
    signIn('leader');

    expect(await listedNames()).toEqual(['Worship']);
  });

  it.each([
    'volunteer',
    'member',
  ] as const)('refuses a %s with 403', async (persona) => {
    signIn(persona);

    expect((await list()).statusCode).toBe(403);
  });
});

describe('GET /ministries/:ministryId', () => {
  it('returns any active Ministry to an admin and the led one to its leader', async () => {
    signIn('admin');
    expect((await detail(fixture.kidsId)).json()).toMatchObject({
      id: fixture.kidsId,
      name: 'kids',
    });

    signIn('leader');
    expect((await detail(fixture.worshipId)).json()).toMatchObject({
      id: fixture.worshipId,
      name: 'Worship',
    });
  });

  it('answers the same 404 for another Ministry, an archived, a foreign, a missing and a malformed id', async () => {
    signIn('leader');
    expect((await detail(fixture.kidsId)).statusCode).toBe(404);

    signIn('admin');
    for (const id of [
      fixture.archivedId,
      fixture.foreignId,
      randomUUID(),
      'nope',
    ]) {
      const res = await detail(id);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: 'NOT_FOUND',
        message: m.error_not_found({}, PT_BR),
      });
    }
  });

  it('refuses a Volunteer with 403 before looking the Ministry up', async () => {
    signIn('volunteer');

    expect((await detail(fixture.worshipId)).statusCode).toBe(403);
    expect((await detail(randomUUID())).statusCode).toBe(403);
  });
});

describe('POST /ministries', () => {
  it('creates a trimmed Ministry for an admin without a Volunteer profile and lists it', async () => {
    signIn('admin');

    const res = await create({ name: '  Media  ' });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ churchId: CHURCH_A, name: 'Media' });
    expect(await listedNames()).toEqual(['kids', 'Media', 'Worship']);
  });

  it.each([
    'leader',
    'volunteer',
    'member',
  ] as const)('refuses a %s with 403 and creates nothing', async (persona) => {
    signIn(persona);

    expect((await create({ name: 'Media' })).statusCode).toBe(403);
    signIn('admin');
    expect(await listedNames()).toEqual(['kids', 'Worship']);
  });

  it.each([
    { name: '   ' },
    { name: 'x'.repeat(256) },
    {},
  ])('refuses %j with 422 VALIDATION_ERROR', async (payload) => {
    signIn('admin');

    const res = await create(payload);

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
  });

  it('refuses an active case-insensitive duplicate with a localized 409, but reuses an archived name', async () => {
    signIn('admin');

    const res = await create({ name: ' WORSHIP ' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'MINISTRY_NAME_IN_USE',
      message: m.error_ministry_name_in_use({}, PT_BR),
    });
    expect((await create({ name: 'old' })).statusCode).toBe(201);
  });

  it('lets exactly one of two concurrent case-variant creates win', async () => {
    signIn('admin');

    const results = await Promise.all([
      create({ name: 'Race' }),
      create({ name: 'RACE' }),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(await listedNames()).toHaveLength(3);
  });
});

describe('PATCH /ministries/:ministryId', () => {
  it('renames the same identity, which the list and detail then show', async () => {
    signIn('admin');

    const res = await rename(fixture.worshipId, { name: ' Praise ' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: fixture.worshipId, name: 'Praise' });
    expect((await detail(fixture.worshipId)).json().name).toBe('Praise');
    expect(await listedNames()).toEqual(['kids', 'Praise']);
  });

  it('saves an unchanged name and a case-only change', async () => {
    signIn('admin');

    expect((await rename(fixture.kidsId, { name: 'kids' })).statusCode).toBe(
      200,
    );
    const res = await rename(fixture.kidsId, { name: 'Kids' });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Kids');
  });

  it('refuses another active Ministry name ignoring case with 409, but allows an archived one', async () => {
    signIn('admin');

    const res = await rename(fixture.kidsId, { name: 'worship' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('MINISTRY_NAME_IN_USE');
    expect((await rename(fixture.kidsId, { name: 'OLD' })).statusCode).toBe(
      200,
    );
  });

  it('lets exactly one of two concurrent renames to the same name win', async () => {
    signIn('admin');

    const results = await Promise.all([
      rename(fixture.kidsId, { name: 'Youth' }),
      rename(fixture.worshipId, { name: 'youth' }),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
  });

  it('refuses the leader of the target Ministry with 403', async () => {
    signIn('leader');

    expect(
      (await rename(fixture.worshipId, { name: 'Praise' })).statusCode,
    ).toBe(403);
  });

  it('answers 404 for an archived or foreign Ministry and 422 for a blank name', async () => {
    signIn('admin');

    expect((await rename(fixture.archivedId, { name: 'New' })).statusCode).toBe(
      404,
    );
    expect((await rename(fixture.foreignId, { name: 'New' })).statusCode).toBe(
      404,
    );
    expect((await rename(fixture.kidsId, { name: ' ' })).statusCode).toBe(422);
  });
});

describe('authentication', () => {
  it('answers 401 without a session on every endpoint', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const responses = await Promise.all([
      list(),
      detail(fixture.worshipId),
      create({ name: 'Media' }),
      rename(fixture.worshipId, { name: 'Media' }),
    ]);

    expect(responses.map((res) => res.statusCode)).toEqual([
      401, 401, 401, 401,
    ]);
  });
});
