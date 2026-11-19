import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import { role, sector } from '@church/db';
import { parseTimeOfDay } from '@church/time';
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
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import { buildVolunteerWithMembership } from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };

const CHURCH_A = '81111111-1111-4111-8111-111111111111';
const CHURCH_B = '82222222-2222-4222-8222-222222222222';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const db = schedulingTestDb;
  const ministryRepo = new DrizzleMinistryRepository({ db });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const authorityGuard = new AuthorityGuard({
    manager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: {} as never,
      eventRepository: {} as never,
      eventTimeBlockRepository: {} as never,
      ministryRepository: ministryRepo,
    }),
  });
  const controller = new MinistryController({
    config: appConfig,
    ministryManager: new DbMinistryManager({
      ministryRepo,
      volunteerRepo: new DrizzleVolunteerRepository({ db }),
      invitationRepo: {} as never,
      unitOfWork: new DrizzleUnitOfWork({ db }),
      sectorRepo: new DrizzleSectorRepository({ db }),
      roleRepo: new DrizzleRoleRepository({ db }),
      usualSetupRepo: new DrizzleUsualSetupRepository({ db }),
      templateRepo: new DrizzleEventTemplateRepository({ db }),
    }),
    ministryInvitationManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard,
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

const NINE = parseTimeOfDay({ value: '09:00' });
const ELEVEN = parseTimeOfDay({ value: '11:00' });

interface SeedBlockedSetupInput {
  churchId: string;
  ministryId: string;
  blockId: string;
  spans: { startTime: string; endTime: string }[];
}

async function seedSetup({
  churchId,
  ministryId,
  blockId,
  spans,
}: SeedBlockedSetupInput) {
  await buildUsualSetup({
    db: schedulingTestDb,
    churchId,
    ministryId,
    sourceTemplateTimeBlockId: blockId,
    id: randomUUID(),
    serves: true,
    shiftSplit: { kind: 'manual', spans } as never,
    headcounts: [],
  });
}

interface SeedTemplateInput {
  churchId: string;
}

async function seedBlock({ churchId }: SeedTemplateInput) {
  const template = await buildEventTemplate({
    db: schedulingTestDb,
    churchId,
    name: 'Sunday',
    weekday: 0,
    blocks: [{ label: 'Morning', startTime: NINE, endTime: ELEVEN }],
  });
  const [block] = template.blocks;
  if (!block) throw new Error('block seed failed');
  return block;
}

async function seed() {
  const db = schedulingTestDb;
  for (const [id, slug] of [
    [CHURCH_A, 'sum-a'],
    [CHURCH_B, 'sum-b'],
  ] as const) {
    await buildChurch({ db, id, name: slug, slug, timezone: 'UTC' });
  }
  await buildUser({ db, id: 'sum-admin', name: 'a', email: 'a@test.com' });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId: 'sum-admin',
    accessLevel: 'admin',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const foreign = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  const child = { db, churchId: CHURCH_A, ministryId: worship.id };
  await buildSector({ ...child, name: 'Stage' });
  await buildSector({ ...child, name: 'Sound' });
  const oldSector = await buildSector({ ...child, name: 'Old' });
  await db
    .update(sector)
    .set({ archivedAt: new Date() })
    .where(eq(sector.id, oldSector.id));
  await buildRole({ ...child, name: 'Singer' });
  const oldRole = await buildRole({ ...child, name: 'Retired' });
  await db
    .update(role)
    .set({ archivedAt: new Date() })
    .where(eq(role.id, oldRole.id));
  await buildSector({
    db,
    churchId: CHURCH_B,
    ministryId: foreign.id,
    name: 'Foreign Room',
  });
  const blockA = await seedBlock({ churchId: CHURCH_A });
  // Worship's manual split overruns the 09:00–11:00 block; Kids' fits it.
  await seedSetup({
    churchId: CHURCH_A,
    ministryId: worship.id,
    blockId: blockA.id,
    spans: [
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '12:00' },
    ],
  });
  await seedSetup({
    churchId: CHURCH_A,
    ministryId: kids.id,
    blockId: blockA.id,
    spans: [
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' },
    ],
  });
  // Another Church's needs-review setup must not leak into Church A.
  const blockB = await seedBlock({ churchId: CHURCH_B });
  await seedSetup({
    churchId: CHURCH_B,
    ministryId: foreign.id,
    blockId: blockB.id,
    spans: [{ startTime: '09:00', endTime: '12:00' }],
  });
  return { worshipId: worship.id, kidsId: kids.id, foreignId: foreign.id };
}

describe('GET /api/v1/ministries list summary', () => {
  it('counts only active Sectors and Roles and flags only the Ministry whose setup needs review', async () => {
    const ids = await seed();
    mockGetSession.mockResolvedValue({
      user: { id: 'sum-admin' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValue({
      status: 'resolved',
      churchId: CHURCH_A,
      volunteerId: null,
      autoSelected: false,
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ministries' });

    expect(res.statusCode).toBe(200);
    const rows = res.json().ministries as Record<string, unknown>[];
    // Same order as before: alphabetical ignoring case; no other Church.
    expect(rows.map((row) => row.name)).toEqual(['Kids', 'Worship']);
    expect(rows.find((row) => row.id === ids.kidsId)).toMatchObject({
      sectorCount: 0,
      roleCount: 0,
      needsReview: false,
    });
    expect(rows.find((row) => row.id === ids.worshipId)).toMatchObject({
      sectorCount: 2,
      roleCount: 1,
      needsReview: true,
    });
  });
});

interface SignInInput {
  userId: string;
}

function signIn({ userId }: SignInInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
}

interface DirectoryInput {
  query?: string;
}

async function directory({ query = '' }: DirectoryInput = {}) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/ministries/directory${query}`,
  });
}

function names(rows: Record<string, unknown>[]) {
  return rows.map((row) => row.name);
}

describe('GET /api/v1/ministries/directory', () => {
  it('filters by status and search on the server while counts cover the whole scope', async () => {
    await seed();
    await buildMinistry({
      db: schedulingTestDb,
      churchId: CHURCH_A,
      name: 'worship team',
    });
    signIn({ userId: 'sum-admin' });
    const counts = { total: 3, review: 1, noSectors: 2 };

    const all = await directory();
    expect(all.statusCode).toBe(200);
    expect(names(all.json().ministries)).toEqual([
      'Kids',
      'Worship',
      'worship team',
    ]);
    expect(all.json()).toMatchObject({ counts });
    expect(all.json().nextCursor).toBeUndefined();

    const review = await directory({ query: '?status=review' });
    expect(names(review.json().ministries)).toEqual(['Worship']);
    expect(review.json().ministries[0]).toMatchObject({ needsReview: true });
    expect(review.json().counts).toEqual(counts);

    const noSectors = await directory({ query: '?status=no-sectors' });
    expect(names(noSectors.json().ministries)).toEqual([
      'Kids',
      'worship team',
    ]);

    const search = await directory({ query: '?search=%20WORSHIP%20' });
    expect(names(search.json().ministries)).toEqual([
      'Worship',
      'worship team',
    ]);
    expect(search.json().counts).toEqual(counts);

    // A LIKE wildcard is matched literally.
    const literal = await directory({ query: '?search=%25' });
    expect(literal.json().ministries).toEqual([]);
  });

  it('pages alphabetically ignoring case with an opaque cursor', async () => {
    await seed();
    await buildMinistry({
      db: schedulingTestDb,
      churchId: CHURCH_A,
      name: 'aux',
    });
    signIn({ userId: 'sum-admin' });

    const first = await directory({ query: '?limit=2' });
    expect(names(first.json().ministries)).toEqual(['aux', 'Kids']);
    const { nextCursor } = first.json();
    expect(nextCursor).toEqual(expect.any(String));

    const second = await directory({
      query: `?limit=2&cursor=${encodeURIComponent(nextCursor)}`,
    });
    expect(names(second.json().ministries)).toEqual(['Worship']);
    expect(second.json().nextCursor).toBeUndefined();
    expect(second.json().counts.total).toBe(3);
  });

  it('refuses a cursor the server could not have produced', async () => {
    await seed();
    signIn({ userId: 'sum-admin' });

    const res = await directory({ query: '?cursor=not-a-cursor' });

    expect(res.statusCode).toBe(422);
  });

  it.each([
    ['a limit above the maximum page size', '?limit=51'],
    ['a blank search', '?search=%20%20'],
  ])('refuses %s', async (_label, query) => {
    await seed();
    signIn({ userId: 'sum-admin' });

    const res = await directory({ query });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
  });

  it('matches %, _ and \\ in a search literally', async () => {
    await seed();
    for (const name of ['50% off', 'a_b', 'back\\slash']) {
      await buildMinistry({ db: schedulingTestDb, churchId: CHURCH_A, name });
    }
    signIn({ userId: 'sum-admin' });

    for (const [search, expected] of [
      ['%25', '50% off'],
      ['_', 'a_b'],
      ['%5C', 'back\\slash'],
    ] as const) {
      const res = await directory({ query: `?search=${search}` });
      expect(names(res.json().ministries), search).toEqual([expected]);
    }
  });

  it('scopes a Ministry leader to the Ministries they lead', async () => {
    const ids = await seed();
    await buildVolunteerWithMembership({
      db: schedulingTestDb,
      churchId: CHURCH_A,
      ministryId: ids.worshipId,
      name: 'Leader',
      email: 'leader@test.com',
      userId: 'sum-leader',
      ministryAccessLevel: 'leader',
    });
    await buildChurchMembership({
      db: schedulingTestDb,
      churchId: CHURCH_A,
      userId: 'sum-leader',
      accessLevel: 'member',
    });
    signIn({ userId: 'sum-leader' });

    const res = await directory();

    expect(res.statusCode).toBe(200);
    expect(names(res.json().ministries)).toEqual(['Worship']);
    expect(res.json().counts).toEqual({ total: 1, review: 1, noSectors: 0 });
  });
});
