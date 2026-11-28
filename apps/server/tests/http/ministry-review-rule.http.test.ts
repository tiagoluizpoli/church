import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import { parseTimeOfDay } from '@church/time';
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
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const db = schedulingTestDb;
const CHURCH = '51111111-1111-4111-8111-111111111111';
const ADMIN = 'rule-admin';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const ministryRepo = new DrizzleMinistryRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const controller = new MinistryController({
    config: appConfig,
    ministryManager: new DbMinistryManager({
      ministryRepo,
      volunteerRepo: new DrizzleVolunteerRepository({ db }),
      invitationRepo: {} as never,
      unitOfWork,
      sectorRepo: new DrizzleSectorRepository({ db }),
      roleRepo: new DrizzleRoleRepository({ db }),
    }),
    ministryInvitationManager: {} as never,
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork,
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
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

/** `[start, end]` pairs of a manual split, in stored order. */
type Spans = [string, string][];

interface Case {
  name: string;
  block: 'day' | 'night';
  spans?: Spans;
  serves?: boolean;
  equalCount?: number;
  needsReview: boolean;
}

const CASES: Case[] = [
  {
    name: 'exact block',
    block: 'day',
    spans: [['09:00', '11:00']],
    needsReview: false,
  },
  {
    name: 'gap and touching ends',
    block: 'day',
    spans: [
      ['09:15', '09:30'],
      ['09:30', '10:00'],
      ['10:30', '11:00'],
    ],
    needsReview: false,
  },
  { name: 'no spans', block: 'day', spans: [], needsReview: false },
  {
    name: 'ends late',
    block: 'day',
    spans: [['09:00', '11:01']],
    needsReview: true,
  },
  {
    name: 'starts early',
    block: 'day',
    spans: [['08:59', '10:00']],
    needsReview: true,
  },
  {
    name: 'overlap',
    block: 'day',
    spans: [
      ['09:00', '10:00'],
      ['09:59', '11:00'],
    ],
    needsReview: true,
  },
  {
    name: 'out of order',
    block: 'day',
    spans: [
      ['10:00', '11:00'],
      ['09:00', '10:00'],
    ],
    needsReview: true,
  },
  {
    name: 'empty span',
    block: 'day',
    spans: [['10:00', '10:00']],
    needsReview: true,
  },
  {
    name: 'reversed span',
    block: 'day',
    spans: [['10:30', '10:00']],
    needsReview: true,
  },
  {
    name: 'ends at block start',
    block: 'day',
    spans: [['10:00', '09:00']],
    needsReview: true,
  },
  {
    name: 'not serving',
    block: 'day',
    spans: [['09:00', '12:00']],
    serves: false,
    needsReview: false,
  },
  // Only a manual split is flagged, even an equal one that cannot tile.
  { name: 'equal split', block: 'day', equalCount: 1000, needsReview: false },
  {
    name: 'overnight fits',
    block: 'night',
    spans: [
      ['22:00', '23:30'],
      ['23:30', '00:30'],
      ['00:30', '02:00'],
    ],
    needsReview: false,
  },
  {
    name: 'overnight ends late',
    block: 'night',
    spans: [['23:00', '02:01']],
    needsReview: true,
  },
  {
    name: 'overnight starts early',
    block: 'night',
    spans: [['21:59', '23:00']],
    needsReview: true,
  },
  {
    name: 'overnight out of order',
    block: 'night',
    spans: [
      ['00:00', '01:00'],
      ['22:00', '23:00'],
    ],
    needsReview: true,
  },
];

const time = (value: string) => parseTimeOfDay({ value });

async function seedCases() {
  await buildChurch({
    db,
    id: CHURCH,
    name: 'Rule',
    slug: 'rule-church',
    timezone: 'America/Sao_Paulo',
  });
  await buildUser({ db, id: ADMIN, name: ADMIN, email: 'admin@rule.test' });
  await buildChurchMembership({
    db,
    churchId: CHURCH,
    userId: ADMIN,
    accessLevel: 'admin',
  });
  const template = await buildEventTemplate({
    db,
    churchId: CHURCH,
    name: 'Weekend',
    recurrence: { kind: 'weekly', weekdays: [0] },
    blocks: [
      { label: 'day', startTime: time('09:00'), endTime: time('11:00') },
      { label: 'night', startTime: time('22:00'), endTime: time('02:00') },
    ],
  });
  const blockIds = new Map(
    template.blocks.map((block) => [block.label, block.id]),
  );
  for (const { name, block, spans, serves, equalCount } of CASES) {
    const { id } = await buildMinistry({ db, churchId: CHURCH, name });
    const shiftSplit = equalCount
      ? { kind: 'equal', count: equalCount }
      : {
          kind: 'manual',
          spans: spans?.map(([startTime, endTime]) => ({ startTime, endTime })),
        };
    await buildUsualSetup({
      db,
      churchId: CHURCH,
      ministryId: id,
      id: randomUUID(),
      sourceTemplateTimeBlockId: blockIds.get(block) as string,
      serves: serves ?? true,
      shiftSplit: shiftSplit as never,
      headcounts: [],
    });
  }
}

const sortedNames = (cases: Case[]) =>
  cases.map(({ name }) => name).sort((a, b) => a.localeCompare(b));

describe('Ministry review flags', () => {
  it('flags the same Ministries on the list, the directory and its review filter', async () => {
    await seedCases();
    getSession.mockResolvedValue({
      user: { id: ADMIN },
      session: { activeOrganizationId: CHURCH },
    } as never);
    const flagged = sortedNames(CASES.filter((c) => c.needsReview));
    const read = async (url: string) => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      return response.json();
    };
    const flaggedIn = (rows: { name: string; needsReview: boolean }[]) =>
      rows.filter((row) => row.needsReview).map((row) => row.name);

    const list = await read('/api/v1/ministries');
    const directory = await read('/api/v1/ministries/directory?limit=50');
    const review = await read(
      '/api/v1/ministries/directory?limit=50&status=review',
    );

    expect(list.ministries).toHaveLength(CASES.length);
    expect(flaggedIn(list.ministries)).toEqual(flagged);
    expect(flaggedIn(directory.ministries)).toEqual(flagged);
    expect(review.ministries.map((row: { name: string }) => row.name)).toEqual(
      flagged,
    );
    expect(directory.counts.review).toBe(flagged.length);
  });
});
