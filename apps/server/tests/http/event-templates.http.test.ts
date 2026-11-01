import { eventTemplate, templateTimeBlock } from '@church/db';
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
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { ChurchId, UserId } from '@/domain/branded-ids';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  // Real manager, repository and AuthorityService decision; only the session and
  // the actor lookup are seams.
  const controller = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: new DbEventTemplateManager({
      templateRepository: new DrizzleEventTemplateRepository({
        db: schedulingTestDb,
      }),
      unitOfWork: new DrizzleUnitOfWork({ db: schedulingTestDb }),
    }),
    planningEventManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    participationManager: {} as never,
    ministryManager: {} as never,
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
  await resetSchedulingPhase3Db();
});

type AccessLevel = 'admin' | 'member';

interface SignInInput {
  accessLevel?: AccessLevel;
}

/** A signed-in actor of Church A; a ChurchAdmin has no Volunteer profile. */
async function signIn({ accessLevel = 'admin' }: SignInInput = {}) {
  const seed = await seedSchedulingPhase3Base();
  const churchId = ChurchId.from(seed.churchAId);
  const userId = UserId.from(seed.adminUserId);
  mockGetSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: seed.churchAId,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId,
    activeChurchId: churchId,
    volunteerId: null,
    churchMembership: { churchId, accessLevel },
    ministryMemberships: [],
  });
  return seed;
}

interface BlockBody {
  label: string;
  startTime: string;
  endTime: string;
  id?: string;
}

interface TemplateBody {
  name: string;
  weekday: number;
  blocks: BlockBody[];
}

const welcome: BlockBody = {
  label: 'Welcome',
  startTime: '09:00',
  endTime: '10:00',
};

function body(overrides: Partial<TemplateBody> = {}): TemplateBody {
  return { name: 'Sunday', weekday: 0, blocks: [welcome], ...overrides };
}

function post(payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/admin/event-templates',
    payload: payload as never,
  });
}

function patch(input: { templateId: string; payload: unknown }) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/event-templates/${input.templateId}`,
    payload: input.payload as never,
  });
}

function list() {
  return app.inject({ method: 'GET', url: '/api/v1/admin/event-templates' });
}

async function storedTemplateCount() {
  return (await schedulingTestDb.select().from(eventTemplate)).length;
}

describe('POST /event-templates', () => {
  it('creates a template for a ChurchAdmin without a Volunteer profile, deriving trimmed, start-ordered blocks and accepting overlap, overnight and a shared weekday', async () => {
    await signIn();

    const res = await post(
      body({
        name: '  Vigil ',
        weekday: 5,
        blocks: [
          { label: 'Late', startTime: '23:30', endTime: '02:00' },
          { label: ' Tie B ', startTime: '09:15', endTime: '11:00' },
          { label: 'Tie A', startTime: '09:15', endTime: '10:00' },
        ],
      }),
    );

    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.name).toBe('Vigil');
    expect(
      created.blocks.map(
        (block: { label: string; order: number }) =>
          `${block.order}:${block.label}`,
      ),
    ).toEqual(['0:Tie B', '1:Tie A', '2:Late']);
    expect(created.blocks[2].endTime).toBe('02:00');

    expect((await post(body({ name: 'Other', weekday: 5 }))).statusCode).toBe(
      201,
    );
    const listed = (await list()).json();
    expect(listed.templates.map((t: { name: string }) => t.name)).toEqual([
      'Other',
      'Vigil',
    ]);
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['name over 255 characters', { name: 'x'.repeat(256) }],
    ['weekday 7', { weekday: 7 }],
    ['fractional weekday', { weekday: 1.5 }],
    ['no blocks', { blocks: [] }],
    ['blank label', { blocks: [{ ...welcome, label: ' ' }] }],
    [
      'label over 255 characters',
      { blocks: [{ ...welcome, label: 'x'.repeat(256) }] },
    ],
    ['clock value 25:00', { blocks: [{ ...welcome, startTime: '25:00' }] }],
    ['seconds precision', { blocks: [{ ...welcome, endTime: '10:00:30' }] }],
    [
      'client-assigned block id',
      { blocks: [{ ...welcome, id: '99999999-9999-4999-8999-999999999999' }] },
    ],
    ['caller-controlled order', { blocks: [{ ...welcome, order: 0 }] }],
  ])('refuses %s with 422 and writes nothing', async (_case, overrides) => {
    await signIn();

    const res = await post(body(overrides as Partial<TemplateBody>));

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
    expect(await storedTemplateCount()).toBe(0);
  });

  it('refuses equal endpoints with 400 INVALID_TIME_RANGE', async () => {
    await signIn();

    const res = await post(
      body({ blocks: [{ ...welcome, startTime: '09:00', endTime: '09:00' }] }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_TIME_RANGE');
    expect(await storedTemplateCount()).toBe(0);
  });

  it('refuses case-insensitive duplicate block labels with the reason', async () => {
    await signIn();

    const res = await post(
      body({
        blocks: [
          welcome,
          { label: ' WELCOME', startTime: '10:00', endTime: '11:00' },
        ],
      }),
    );

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason: 'DUPLICATE_TEMPLATE_BLOCK_LABEL',
    });
    expect(await storedTemplateCount()).toBe(0);
  });

  it('refuses a case-insensitive duplicate name within the Church but allows it in another Church', async () => {
    const seed = await signIn();
    await buildEventTemplate({
      db: schedulingTestDb,
      churchId: seed.churchBId,
      name: 'Sunday',
      weekday: 0,
      blocks: [],
    });
    expect((await post(body({ name: 'Sunday' }))).statusCode).toBe(201);

    const res = await post(body({ name: 'SUNDAY' }));

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason: 'DUPLICATE_TEMPLATE_NAME',
    });
    expect(await storedTemplateCount()).toBe(2);
  });

  it('lets exactly one of two simultaneous writes of the same name win, with no raw database error', async () => {
    await signIn();

    const results = await Promise.all([
      post(body({ name: 'Race' })),
      post(body({ name: 'race' })),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    const refused = results.find((r) => r.statusCode === 422);
    expect(refused?.json().reason).toBe('DUPLICATE_TEMPLATE_NAME');
    expect(await storedTemplateCount()).toBe(1);
  });

  it('rolls the template back when its blocks cannot be stored and hides the database error', async () => {
    await signIn();

    // NUL passes request validation but PostgreSQL rejects it on the block insert.
    const res = await post(
      body({ blocks: [{ ...welcome, label: 'Bad\u0000label' }] }),
    );

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(res.json())).not.toMatch(/invalid byte|postgres/i);
    expect(await storedTemplateCount()).toBe(0);
    expect(
      await schedulingTestDb.select().from(templateTimeBlock),
    ).toHaveLength(0);
  });
});

describe('PATCH /event-templates/:templateId (existing edit stays compatible)', () => {
  it('renames and retimes with the shared contract, deriving order, and refuses a name taken in the Church', async () => {
    const seed = await signIn();
    const first = (await post(body({ name: 'First' }))).json();
    await post(body({ name: 'Second' }));

    const renamed = await patch({
      templateId: first.id,
      payload: {
        name: 'Renamed',
        weekday: 2,
        blocks: [
          { label: 'B', startTime: '11:00', endTime: '12:00' },
          {
            id: first.blocks[0].id,
            label: 'A',
            startTime: '08:00',
            endTime: '09:00',
          },
        ],
      },
    });
    expect(renamed.statusCode).toBe(200);
    expect(
      renamed.json().blocks.map((b: { label: string }) => b.label),
    ).toEqual(['A', 'B']);

    const conflict = await patch({
      templateId: first.id,
      payload: body({ name: 'second' }),
    });
    expect(conflict.statusCode).toBe(422);
    expect(conflict.json().reason).toBe('DUPLICATE_TEMPLATE_NAME');
    const [stored] = await schedulingTestDb
      .select()
      .from(eventTemplate)
      .where(eq(eventTemplate.id, first.id));
    expect(stored?.name).toBe('Renamed');
    expect(stored?.churchId).toBe(seed.churchAId);
  });
});

describe('GET /event-templates and authorization', () => {
  it('lists the Active Church templates alphabetically, ignoring case, without foreign templates', async () => {
    const seed = await signIn();
    for (const name of ['banana', 'Cherry', 'Apple']) {
      await buildEventTemplate({
        db: schedulingTestDb,
        churchId: seed.churchAId,
        name,
        weekday: 1,
        blocks: [],
      });
    }
    await buildEventTemplate({
      db: schedulingTestDb,
      churchId: seed.churchBId,
      name: 'Foreign',
      weekday: 1,
      blocks: [],
    });

    const res = await list();

    expect(res.statusCode).toBe(200);
    expect(
      res.json().templates.map((template: { name: string }) => template.name),
    ).toEqual(['Apple', 'banana', 'Cherry']);
  });

  it('answers 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null as never);

    expect((await list()).statusCode).toBe(401);
    expect((await post(body())).statusCode).toBe(401);
  });

  it('answers 403 to a signed-in member without ChurchAdmin authority and writes nothing', async () => {
    await signIn({ accessLevel: 'member' });

    expect((await list()).statusCode).toBe(403);
    expect((await post(body())).statusCode).toBe(403);
    expect(await storedTemplateCount()).toBe(0);
  });
});
