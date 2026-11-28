import { ministry } from '@church/db';
import { parseInstant } from '@church/time';
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
import { ActiveChurchController } from '@/api/controllers/active-church-controller';
import { DbActiveChurchSelectionManager } from '@/application/db-active-church-selection-manager';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
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
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { compareStatementCounts } from '@/tests/test-support/statement-count';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const db = schedulingTestDb;
const PERSON = 'picker-person';
const OTHER = 'picker-other';
const OPTIONS = {
  method: 'GET',
  url: '/api/v1/active-church/options',
} as const;

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: {} as never,
  });
  const controller = new ActiveChurchController({
    activeChurchResolver: {} as never,
    selectionManager: new DbActiveChurchSelectionManager({
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      authorityManager,
      activeChurchResolver: {} as never,
      churchRepository: {} as never,
      objectStorage: { publicUrl: ({ key }) => key },
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
  for (const id of [PERSON, OTHER]) {
    await buildUser({ db, id, name: id, email: `${id}@picker.test` });
  }
  getSession.mockResolvedValue({
    user: { id: PERSON },
    session: { activeOrganizationId: null },
  } as never);
});

interface LedMinistry {
  userId: string;
  level?: 'leader' | 'volunteer';
  /** The Volunteer profile was retired. */
  retired?: boolean;
  endedMembership?: boolean;
  archivedMinistry?: boolean;
}

interface ChurchFixture {
  name: string;
  accessLevel?: 'member' | 'admin';
  ministryMembers?: LedMinistry[];
}

const LEFT_AT = parseInstant({ value: '2030-01-01T00:00:00.000Z' });
let churchSequence = 0;

/** One Church the Person belongs to, with the Ministry facts the case needs. */
async function joinChurch({
  name,
  accessLevel = 'member',
  ministryMembers = [],
}: ChurchFixture) {
  churchSequence += 1;
  const suffix = String(churchSequence).padStart(12, '0');
  const churchId = `72222222-2222-4222-8222-${suffix}`;
  await buildChurch({
    db,
    id: churchId,
    name,
    slug: `picker-${churchSequence}`,
    timezone: 'UTC',
  });
  await buildChurchMembership({ db, churchId, userId: PERSON, accessLevel });
  for (const [index, fixture] of ministryMembers.entries()) {
    const { userId, level = 'leader' } = fixture;
    if (userId !== PERSON) {
      await buildChurchMembership({
        db,
        churchId,
        userId,
        accessLevel: 'member',
      });
    }
    const { id: ministryId } = await buildMinistry({
      db,
      churchId,
      name: `${name} ${index}`,
    });
    const { id: volunteerId } = await buildVolunteer({
      db,
      churchId,
      userId,
      leftAt: fixture.retired ? LEFT_AT : undefined,
    });
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId,
      ministryId,
      ministryAccessLevel: level,
      status: fixture.endedMembership ? 'inactive' : 'active',
      leftAt: fixture.endedMembership ? LEFT_AT : undefined,
      roleIds: [],
    });
    if (fixture.archivedMinistry) {
      await db
        .update(ministry)
        .set({ deletedAt: new Date('2030-01-01T00:00:00.000Z') })
        .where(eq(ministry.id, ministryId));
    }
  }
  return churchId;
}

const SCHEDULING = ['dashboard', 'scheduling'];
const DASHBOARD = ['dashboard'];

interface Option {
  name: string;
  availableAreas: string[];
}

/** Areas by Church name; the listing's order is pinned in list-ordering. */
function areasByChurch(churches: Option[]) {
  return Object.fromEntries(
    churches.map(({ name, availableAreas }) => [name, availableAreas]),
  );
}

describe('GET /api/v1/active-church/options reads', () => {
  it('lists each Church with its own areas', async () => {
    await joinChurch({ name: 'Admin', accessLevel: 'admin' });
    const leaderId = await joinChurch({
      name: 'Leader',
      ministryMembers: [{ userId: PERSON }],
    });
    await joinChurch({ name: 'Plain member' });
    await joinChurch({
      name: 'Someone else leads',
      ministryMembers: [{ userId: OTHER }],
    });

    const response = await app.inject(OPTIONS);

    expect(response.statusCode).toBe(200);
    const { churches } = response.json();
    expect(churches).toHaveLength(4);
    expect(areasByChurch(churches)).toEqual({
      Admin: SCHEDULING,
      Leader: SCHEDULING,
      'Plain member': DASHBOARD,
      'Someone else leads': DASHBOARD,
    });
    expect(churches.find((church: Option) => church.name === 'Leader')).toEqual(
      {
        churchId: leaderId,
        name: 'Leader',
        timezone: 'UTC',
        accessLevel: 'member',
        availableAreas: SCHEDULING,
        logoUrl: null,
        accentColor: null,
        lastOpenedAt: null,
        locality: null,
      },
    );
  });

  // A User holds one active Volunteer profile, so each case stands alone.
  it.each<[string, Omit<LedMinistry, 'userId'>]>([
    ['a volunteer-level member', { level: 'volunteer' }],
    ['a retired Volunteer profile', { retired: true }],
    ['an ended leader membership', { endedMembership: true }],
    ['the leader of an archived Ministry', { archivedMinistry: true }],
  ])('grants no scheduling to %s', async (_case, ministryMember) => {
    await joinChurch({
      name: 'Case',
      ministryMembers: [{ userId: PERSON, ...ministryMember }],
    });

    const response = await app.inject(OPTIONS);

    expect(response.statusCode).toBe(200);
    expect(areasByChurch(response.json().churches)).toEqual({
      Case: DASHBOARD,
    });
  });

  it('pins the statements as the Person joins more Churches', async () => {
    await joinChurch({ name: 'First', ministryMembers: [{ userId: PERSON }] });

    const { small, large } = await compareStatementCounts({
      app,
      requests: [OPTIONS],
      grow: async () => {
        await joinChurch({ name: 'Second', accessLevel: 'admin' });
        await joinChurch({ name: 'Third' });
        await joinChurch({ name: 'Fourth' });
      },
    });

    const [before] = small;
    const [after] = large;
    expect(before?.response.statusCode).toBe(200);
    expect(after?.response.statusCode).toBe(200);
    expect(areasByChurch(after?.response.json().churches)).toEqual({
      First: SCHEDULING,
      Second: SCHEDULING,
      Third: DASHBOARD,
      Fourth: DASHBOARD,
    });
    expect({ small: before?.statements, large: after?.statements }).toEqual({
      small: 2,
      large: 2,
    });
  });
});
