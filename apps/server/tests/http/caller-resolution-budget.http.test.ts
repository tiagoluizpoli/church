import { appConfig } from '@church/app-config';
import { member, ministryMembership } from '@church/db';
import { and, eq } from 'drizzle-orm';
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
import { CallerCapabilitiesController } from '@/api/controllers/caller-capabilities-controller';
import { InvitationController } from '@/api/controllers/invitation-controller';
import { PeopleController } from '@/api/controllers/people-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbInvitationListManager } from '@/application/db-invitation-list-manager';
import { DbPeopleListManager } from '@/application/db-people-list-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleInvitationListRepository } from '@/infrastructure/repositories/drizzle-invitation-list.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzlePeopleListRepository } from '@/infrastructure/repositories/drizzle-people-list.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildMinistryInvitation,
} from '@/seeds/builders/ministry';
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
import { compareStatementCounts } from '@/tests/test-support/statement-count';

// Only the Better Auth session is a seam: Active Church resolution, authority
// and the list reads run for real, so every statement a request costs is counted.
vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const db = schedulingTestDb;
const CHURCH = '71111111-1111-4111-8111-111111111111';
const LEADER = 'budget-leader';
const ADMIN = 'budget-admin';
const INVITEE = 'budget-invitee';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const authorityManager = new DbAuthorityManager({
    actorRepository,
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  const authorityGuard = new AuthorityGuard({ manager: authorityManager });
  const activeChurchResolver = new DbActiveChurchResolver({
    actorRepository,
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
  });
  const controllers = [
    new CallerCapabilitiesController({
      sessionGateway: testSessionGateway(),
      activeChurchResolver,
      authorityGuard,
    }),
    new PeopleController({
      sessionGateway: testSessionGateway(),
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
    new InvitationController({
      sessionGateway: testSessionGateway(),
      invitationListManager: new DbInvitationListManager({
        invitationListRepository: new DrizzleInvitationListRepository({ db }),
        authorityManager,
        defaultPageSize: 20,
      }),
      ministryInvitationManager: {} as never,
      activeChurchResolver,
      authorityGuard,
      maxPageSize: 50,
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

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH,
    name: 'Budget',
    slug: 'budget-church',
    timezone: 'UTC',
  });
  for (const [id, accessLevel] of [
    [LEADER, 'member'],
    [ADMIN, 'admin'],
    [INVITEE, 'member'],
  ] as const) {
    await buildUser({ db, id, name: id, email: `${id}@budget.test` });
    await buildChurchMembership({
      db,
      churchId: CHURCH,
      userId: id,
      accessLevel,
    });
  }
  worshipId = (await buildMinistry({ db, churchId: CHURCH, name: 'Worship' }))
    .id;
  leaderVolunteerId = (
    await buildVolunteer({ db, churchId: CHURCH, userId: LEADER })
  ).id;
  await lead(worshipId);
  await buildMinistryInvitation({
    db,
    churchId: CHURCH,
    ministryId: worshipId,
    inviteeUserId: INVITEE,
    inviterId: LEADER,
    ministryAccessLevel: 'volunteer',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  });
});

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

function signIn(userId: string) {
  getSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: CHURCH },
  } as never);
}

const CAPABILITIES = '/api/v1/caller-capabilities';
const PEOPLE = '/api/v1/people';
const INVITATIONS = '/api/v1/invitations';

describe('caller resolution statement budget', () => {
  it('pins the statements a leader pays per request as their led Ministries grow', async () => {
    signIn(LEADER);
    const { small, large } = await compareStatementCounts({
      app,
      requests: [CAPABILITIES, PEOPLE, INVITATIONS].map((url) => ({
        method: 'GET' as const,
        url,
      })),
      grow: async () => {
        for (const name of ['Kids', 'Ushers', 'Media', 'Welcome']) {
          const { id } = await buildMinistry({ db, churchId: CHURCH, name });
          await lead(id);
        }
      },
    });
    for (const { response } of [...small, ...large]) {
      expect(response.statusCode).toBe(200);
    }
    const [smallCapabilities] = small;
    const [largeCapabilities] = large;
    expect(smallCapabilities?.response.json().ledMinistries).toEqual([
      { ministryId: worshipId, name: 'Worship' },
    ]);
    expect(largeCapabilities?.response.json().ledMinistries).toHaveLength(5);
    expect(small[2]?.response.json().items).toHaveLength(1);
    expect({
      small: small.map(({ statements }) => statements),
      large: large.map(({ statements }) => statements),
    }).toEqual({ small: [4, 8, 9], large: [4, 8, 9] });
  });

  it('reflects a leader demoted between requests on the very next one', async () => {
    signIn(LEADER);
    const before = await app.inject({ method: 'GET', url: CAPABILITIES });
    expect(before.json().ledMinistries).toEqual([
      { ministryId: worshipId, name: 'Worship' },
    ]);
    expect((await app.inject({ method: 'GET', url: PEOPLE })).statusCode).toBe(
      200,
    );

    await db
      .update(ministryMembership)
      .set({ ministryAccessLevel: 'volunteer' })
      .where(eq(ministryMembership.volunteerId, leaderVolunteerId));

    const after = await app.inject({ method: 'GET', url: CAPABILITIES });
    expect(after.json()).toMatchObject({
      isChurchAdmin: false,
      ledMinistries: [],
    });
    expect((await app.inject({ method: 'GET', url: PEOPLE })).statusCode).toBe(
      403,
    );
    expect(
      (await app.inject({ method: 'GET', url: INVITATIONS })).statusCode,
    ).toBe(403);
  });

  it('reflects a removed ChurchAdmin access on the very next request', async () => {
    signIn(ADMIN);
    const before = await app.inject({ method: 'GET', url: CAPABILITIES });
    expect(before.json()).toMatchObject({ isChurchAdmin: true });

    await db
      .update(member)
      .set({ role: 'member' })
      .where(and(eq(member.organizationId, CHURCH), eq(member.userId, ADMIN)));

    const after = await app.inject({ method: 'GET', url: CAPABILITIES });
    expect(after.json()).toMatchObject({
      isChurchAdmin: false,
      ledMinistries: [],
    });
    expect((await app.inject({ method: 'GET', url: PEOPLE })).statusCode).toBe(
      403,
    );
  });
});
