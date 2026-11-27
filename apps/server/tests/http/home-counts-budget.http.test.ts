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
import { PeopleController } from '@/api/controllers/people-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DbPeopleListManager } from '@/application/db-people-list-manager';
import type { UsualSetupShiftSplit } from '@/domain/entities/usual-setup';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzlePeopleListRepository } from '@/infrastructure/repositories/drizzle-people-list.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
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
import { compareStatementCounts } from '@/tests/test-support/statement-count';

// Only the Better Auth session is a seam, so every statement a request costs is counted.
vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const db = schedulingTestDb;
const CHURCH = '61111111-1111-4111-8111-111111111111';
const ADMIN = 'counts-admin';
const LEADER = 'counts-leader';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const ministryRepo = new DrizzleMinistryRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const authorityManager = new DbAuthorityManager({
    actorRepository,
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: ministryRepo,
  });
  const authorityGuard = new AuthorityGuard({ manager: authorityManager });
  const activeChurchResolver = new DbActiveChurchResolver({
    actorRepository,
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork,
  });
  const controllers = [
    new MinistryController({
      config: appConfig,
      ministryManager: new DbMinistryManager({
        ministryRepo,
        volunteerRepo: new DrizzleVolunteerRepository({ db }),
        invitationRepo: {} as never,
        unitOfWork,
        sectorRepo: new DrizzleSectorRepository({ db }),
        roleRepo: new DrizzleRoleRepository({ db }),
        usualSetupRepo: new DrizzleUsualSetupRepository({ db }),
        templateRepo: new DrizzleEventTemplateRepository({ db }),
      }),
      ministryInvitationManager: {} as never,
      activeChurchResolver,
      authorityGuard,
    }),
    new PeopleController({
      peopleListManager: new DbPeopleListManager({
        peopleListRepository: new DrizzlePeopleListRepository({ db }),
        authorityManager,
        config: appConfig,
      }),
      churchAccessManager: {} as never,
      ministryMembershipManager: {} as never,
      activeChurchResolver,
      authorityGuard,
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

let leaderVolunteerId: string;
let worshipId: string;

const NINE = parseTimeOfDay({ value: '09:00' });
const ELEVEN = parseTimeOfDay({ value: '11:00' });
/** Overruns the 09:00–11:00 block, so a serving entry needs review. */
const OVERRUN: UsualSetupShiftSplit = {
  kind: 'manual',
  spans: [{ startTime: NINE, endTime: parseTimeOfDay({ value: '12:00' }) }],
};

async function lead(ministryId: string) {
  await buildMinistryMembership({
    db,
    churchId: CHURCH,
    volunteerId: leaderVolunteerId,
    ministryId,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
}

/** A Ministry the leader leads, with its own template whose setup needs review. */
async function ministryNeedingReview(name: string) {
  const { id } = await buildMinistry({ db, churchId: CHURCH, name });
  const template = await buildEventTemplate({
    db,
    churchId: CHURCH,
    name: `${name} template`,
    recurrence: { kind: 'weekly', weekdays: [0] },
    blocks: [
      { label: 'Morning', startTime: NINE, endTime: ELEVEN },
      { label: 'Late', startTime: NINE, endTime: ELEVEN },
    ],
  });
  for (const block of template.blocks) {
    await buildUsualSetup({
      db,
      churchId: CHURCH,
      ministryId: id,
      id: randomUUID(),
      sourceTemplateTimeBlockId: block.id,
      serves: true,
      shiftSplit: OVERRUN as never,
      headcounts: [],
    });
  }
  await lead(id);
  return id;
}

async function person(id: string) {
  await buildUser({ db, id, name: id, email: `${id}@counts.test` });
  await buildChurchMembership({
    db,
    churchId: CHURCH,
    userId: id,
    accessLevel: 'member',
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH,
    name: 'Counts',
    slug: 'counts-church',
    timezone: 'UTC',
  });
  await buildUser({ db, id: ADMIN, name: ADMIN, email: 'admin@counts.test' });
  await buildChurchMembership({
    db,
    churchId: CHURCH,
    userId: ADMIN,
    accessLevel: 'admin',
  });
  await person(LEADER);
  leaderVolunteerId = (
    await buildVolunteer({ db, churchId: CHURCH, userId: LEADER })
  ).id;
  worshipId = await ministryNeedingReview('Worship');
});

function signIn(userId: string) {
  getSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: CHURCH },
  } as never);
}

const MINISTRIES = '/api/v1/ministries';
const DIRECTORY = '/api/v1/ministries/directory';
const MINISTRY_REQUESTS = [
  MINISTRIES,
  DIRECTORY,
  `${DIRECTORY}?limit=1`,
  `${DIRECTORY}?status=review`,
];

async function growMinistries() {
  for (const name of ['Kids', 'Media', 'Ushers', 'Welcome']) {
    await ministryNeedingReview(name);
  }
}

describe('Home counters statement budget', () => {
  it.each([
    ['a ChurchAdmin', ADMIN],
    ['a Ministry leader', LEADER],
  ])('keeps the Ministries list and directory flat for %s as Ministries and templates grow', async (_label, userId) => {
    signIn(userId);
    const { small, large } = await compareStatementCounts({
      app,
      requests: MINISTRY_REQUESTS.map((url) => ({ method: 'GET', url })),
      grow: growMinistries,
    });

    for (const { response } of [...small, ...large]) {
      expect(response.statusCode).toBe(200);
    }
    const [smallList, smallDirectory] = small;
    expect(smallList?.response.json().ministries).toMatchObject([
      { id: worshipId, needsReview: true },
    ]);
    expect(smallDirectory?.response.json().counts).toEqual({
      total: 1,
      review: 1,
      noSectors: 1,
    });
    const [largeList, , largeOne, largeReview] = large;
    expect(
      largeList?.response
        .json()
        .ministries.map((row: { needsReview: boolean }) => row.needsReview),
    ).toEqual([true, true, true, true, true]);
    expect(largeOne?.response.json()).toMatchObject({
      ministries: [{ name: 'Kids', needsReview: true }],
      counts: { total: 5, review: 5, noSectors: 5 },
    });
    expect(largeReview?.response.json().ministries).toHaveLength(5);
    expect({
      small: small.map(({ statements }) => statements),
      large: large.map(({ statements }) => statements),
    }).toEqual(
      userId === ADMIN
        ? { small: [8, 9, 9, 9], large: [8, 9, 9, 9] }
        : { small: [11, 11, 11, 11], large: [11, 11, 11, 11] },
    );
  });

  it.each([
    ['a ChurchAdmin', ADMIN],
    ['a Ministry leader', LEADER],
  ])('keeps the People count-only call flat for %s as people grow', async (_label, userId) => {
    signIn(userId);
    const { small, large } = await compareStatementCounts({
      app,
      requests: [{ method: 'GET', url: '/api/v1/people?limit=1' }],
      grow: async () => {
        for (const id of ['p-one', 'p-two', 'p-three', 'p-four']) {
          await person(id);
          const volunteer = await buildVolunteer({
            db,
            churchId: CHURCH,
            userId: id,
          });
          await buildMinistryMembership({
            db,
            churchId: CHURCH,
            volunteerId: volunteer.id,
            ministryId: worshipId,
            ministryAccessLevel: 'volunteer',
            roleIds: [],
          });
        }
      },
    });

    for (const { response } of [...small, ...large]) {
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toHaveLength(1);
    }
    expect({
      small: small[0]?.response.json().counts.total,
      large: large[0]?.response.json().counts.total,
    }).toEqual(
      userId === ADMIN ? { small: 2, large: 6 } : { small: 1, large: 5 },
    );
    expect({
      small: small.map(({ statements }) => statements),
      large: large.map(({ statements }) => statements),
    }).toEqual(
      userId === ADMIN
        ? { small: [6], large: [6] }
        : { small: [8], large: [8] },
    );
  });
});
