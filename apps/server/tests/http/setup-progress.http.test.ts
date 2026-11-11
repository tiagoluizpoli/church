import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  role,
  sector,
} from '@church/db';
import { parseCalendarDay } from '@church/time';
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
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbSetupProgressManager } from '@/application/db-setup-progress-manager';
import { ChurchId, UserId } from '@/domain/branded-ids';
import { DrizzleSetupProgressRepository } from '@/infrastructure/repositories/drizzle-setup-progress.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  buildCycle,
  type SeededCycleLifecycle,
} from '@/seeds/builders/scheduling';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const CHURCH_B = '22222222-2222-4222-8222-222222222222';
const ADMIN = 'setup-admin';
const INVITEE = 'setup-invitee';
const FUTURE = new Date('2099-01-01T00:00:00.000Z');

const NOTHING_SET_UP = {
  churchId: CHURCH_A,
  hasMinistry: false,
  hasMinistryWithSectorsAndRoles: false,
  hasInvitedLeader: false,
  hasEventTemplate: false,
  hasEverSentCycle: false,
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: {} as never,
    planningEventManager: {} as never,
    ministryManager: {} as never,
    setupProgressManager: new DbSetupProgressManager({
      setupProgressRepository: new DrizzleSetupProgressRepository({ db }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: actorRepository as never,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: {} as never,
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
  await truncateAll();
  await buildUser({ db, id: ADMIN, name: 'Admin', email: 'admin@setup.test' });
  await buildUser({
    db,
    id: INVITEE,
    name: 'Invitee',
    email: 'invitee@setup.test',
  });
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Church A',
    slug: 'church-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'Church B',
    slug: 'church-b',
    timezone: 'America/New_York',
  });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId: ADMIN,
    accessLevel: 'admin',
  });
});

type Persona = 'admin' | 'member';

interface SignInInput {
  persona?: Persona;
}

/** The ChurchAdmin of Church A, with no Volunteer profile. */
function signIn({ persona = 'admin' }: SignInInput = {}) {
  mockGetSession.mockResolvedValue({
    user: { id: ADMIN },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId: UserId.from(ADMIN),
    activeChurchId: ChurchId.from(CHURCH_A),
    volunteerId: null,
    churchMembership: {
      churchId: ChurchId.from(CHURCH_A),
      accessLevel: persona,
    },
    ministryMemberships: [],
  });
}

function getSetupProgress() {
  return app.inject({ method: 'GET', url: '/api/v1/admin/setup-progress' });
}

interface ChurchScopedInput {
  churchId?: string;
}

async function seedMinistry({ churchId = CHURCH_A }: ChurchScopedInput = {}) {
  return buildMinistry({
    db,
    churchId,
    name: `Worship ${crypto.randomUUID()}`,
  });
}

interface SeedLeaderInvitationInput {
  churchId?: string;
  level?: 'leader' | 'volunteer';
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
}

async function seedMinistryInvitation({
  churchId = CHURCH_A,
  level = 'leader',
  status = 'pending',
}: SeedLeaderInvitationInput = {}) {
  const invited = await seedMinistry({ churchId });
  await db.insert(ministryInvitation).values({
    churchId,
    ministryId: invited.id,
    inviteeUserId: INVITEE,
    ministryAccessLevel: level,
    status,
    inviterId: ADMIN,
    expiresAt: FUTURE,
  });
}

async function seedTemplate({ churchId = CHURCH_A }: ChurchScopedInput = {}) {
  await buildEventTemplate({
    db,
    churchId,
    name: 'Sunday',
    weekday: 0,
    blocks: [],
  });
}

interface SeedCycleInput {
  churchId?: string;
  state: SeededCycleLifecycle;
}

async function seedCycle({ churchId = CHURCH_A, state }: SeedCycleInput) {
  return buildCycle({
    db,
    churchId,
    name: 'October',
    startDate: parseCalendarDay({ value: '2026-10-01' }),
    endDate: parseCalendarDay({ value: '2026-10-31' }),
    state,
  });
}

describe('GET /api/v1/admin/setup-progress', () => {
  it('reports nothing set up for a new Church, to an admin without a Volunteer profile', async () => {
    signIn();

    const response = await getSetupProgress();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(NOTHING_SET_UP);
  });

  it('ticks a Ministry alone, without Sectors and Roles', async () => {
    signIn();
    await seedMinistry();

    const response = await getSetupProgress();

    expect(response.json()).toEqual({ ...NOTHING_SET_UP, hasMinistry: true });
  });

  it('ticks Sectors and Roles only when one Ministry has both', async () => {
    signIn();
    const worship = await seedMinistry();
    const kids = await seedMinistry();
    await buildSector({
      db,
      churchId: CHURCH_A,
      ministryId: worship.id,
      name: 'Stage',
    });
    await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: kids.id,
      name: 'Teacher',
    });

    const split = await getSetupProgress();
    await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: worship.id,
      name: 'Vocals',
    });
    const together = await getSetupProgress();

    expect(split.json()).toMatchObject({
      hasMinistry: true,
      hasMinistryWithSectorsAndRoles: false,
    });
    expect(together.json()).toMatchObject({
      hasMinistryWithSectorsAndRoles: true,
    });
  });

  it.each([
    'ministry',
    'sector',
    'role',
  ] as const)('ignores archived configuration: an archived %s', async (archived) => {
    signIn();
    const worship = await seedMinistry();
    const stage = await buildSector({
      db,
      churchId: CHURCH_A,
      ministryId: worship.id,
      name: 'Stage',
    });
    const vocals = await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: worship.id,
      name: 'Vocals',
    });
    const archivedAt = new Date('2026-10-01T00:00:00.000Z');
    if (archived === 'ministry') {
      await db
        .update(ministry)
        .set({ deletedAt: archivedAt })
        .where(eq(ministry.id, worship.id));
    } else if (archived === 'sector') {
      await db
        .update(sector)
        .set({ archivedAt })
        .where(eq(sector.id, stage.id));
    } else {
      await db.update(role).set({ archivedAt }).where(eq(role.id, vocals.id));
    }

    const response = await getSetupProgress();

    expect(response.json()).toMatchObject({
      hasMinistry: archived !== 'ministry',
      hasMinistryWithSectorsAndRoles: false,
    });
  });

  it.each([
    ['a pending leader invitation', 'leader', 'pending', true],
    ['an accepted leader invitation', 'leader', 'accepted', true],
    ['a revoked leader invitation', 'leader', 'canceled', false],
    ['a declined leader invitation', 'leader', 'rejected', false],
    ['a pending volunteer invitation', 'volunteer', 'pending', false],
  ] as const)('counts %s as an invited leader: %s', async (_name, level, status, invited) => {
    signIn();
    await seedMinistryInvitation({ level, status });

    const response = await getSetupProgress();

    expect(response.json()).toMatchObject({ hasInvitedLeader: invited });
  });

  it('does not count a Church-admin-only invitation as an invited leader', async () => {
    signIn();
    await db.insert(churchInvitation).values({
      id: crypto.randomUUID(),
      organizationId: CHURCH_A,
      email: 'second-admin@setup.test',
      role: 'admin',
      inviterId: ADMIN,
      expiresAt: FUTURE,
    });

    const response = await getSetupProgress();

    expect(response.json()).toEqual(NOTHING_SET_UP);
  });

  it('ticks an event template', async () => {
    signIn();
    await seedTemplate();

    const response = await getSetupProgress();

    expect(response.json()).toEqual({
      ...NOTHING_SET_UP,
      hasEventTemplate: true,
    });
  });

  it.each([
    ['a draft', 'draft', false],
    ['a sent Cycle', 'sent', true],
    ['a Past Cycle that was sent', 'past-from-sent', true],
    ['a draft that expired unsent', 'past-from-draft', false],
  ] as const)('reports %s as ever sent: %s', async (_name, state, sent) => {
    signIn();
    await seedCycle({ state });

    const response = await getSetupProgress();

    expect(response.json()).toEqual({
      ...NOTHING_SET_UP,
      hasEverSentCycle: sent,
    });
  });

  it("never reports another Church's setup", async () => {
    signIn();
    const foreign = await seedMinistry({ churchId: CHURCH_B });
    await buildSector({
      db,
      churchId: CHURCH_B,
      ministryId: foreign.id,
      name: 'Stage',
    });
    await buildRole({
      db,
      churchId: CHURCH_B,
      ministryId: foreign.id,
      name: 'Vocals',
    });
    await seedMinistryInvitation({ churchId: CHURCH_B });
    await seedTemplate({ churchId: CHURCH_B });
    await seedCycle({ churchId: CHURCH_B, state: 'sent' });

    const response = await getSetupProgress();

    expect(response.json()).toEqual(NOTHING_SET_UP);
  });

  it('refuses an unauthenticated caller with 401 UNAUTHORIZED', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const response = await getSetupProgress();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('refuses a Church Member who is not an admin with 403 FORBIDDEN', async () => {
    signIn({ persona: 'member' });

    const response = await getSetupProgress();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('refuses a caller without Church membership with 403 FORBIDDEN', async () => {
    signIn();
    activeChurchResolver.resolve.mockResolvedValue({ status: 'no_membership' });

    const response = await getSetupProgress();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('refuses with 409 ACTIVE_CHURCH_SELECTION_REQUIRED when no Church is selected', async () => {
    signIn();
    activeChurchResolver.resolve.mockResolvedValue({
      status: 'selection_required',
    });

    const response = await getSetupProgress();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ACTIVE_CHURCH_SELECTION_REQUIRED',
    });
  });
});
