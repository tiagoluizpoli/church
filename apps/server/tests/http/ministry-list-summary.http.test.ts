import { randomUUID } from 'node:crypto';
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

const CHURCH_A = '81111111-1111-4111-8111-111111111111';
const CHURCH_B = '82222222-2222-4222-8222-222222222222';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const db = schedulingTestDb;
  const ministryRepo = new DrizzleMinistryRepository({ db });
  app = await createFastify({ locale: testLocale });
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
