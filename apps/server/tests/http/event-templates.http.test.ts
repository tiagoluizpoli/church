import {
  assignment,
  event,
  eventTemplate,
  eventTimeBlock,
  shift,
  shiftRequirement,
  templateTimeBlock,
  usualSetup,
} from '@church/db';
import { fromDate, parseTimeOfDay } from '@church/time';
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
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildAssignment,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
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

describe('PATCH /event-templates/:templateId name rules', () => {
  it('allows an unchanged name and refuses a name taken in the Church, ignoring case', async () => {
    const seed = await signIn();
    const first = (await post(body({ name: 'First' }))).json();
    await post(body({ name: 'Second' }));

    const unchanged = await patch({
      templateId: first.id,
      payload: body({
        name: 'First',
        blocks: [{ ...welcome, id: first.blocks[0].id }],
      }),
    });
    expect(unchanged.statusCode).toBe(200);

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
    expect(stored?.name).toBe('First');
    expect(stored?.churchId).toBe(seed.churchAId);
  });
});

const ids = {
  template: '66666666-6666-4666-8666-666666666601',
  sibling: '66666666-6666-4666-8666-666666666602',
  foreign: '66666666-6666-4666-8666-666666666603',
  welcome: '77777777-7777-4777-8777-777777777701',
  worship: '77777777-7777-4777-8777-777777777702',
  vigil: '77777777-7777-4777-8777-777777777703',
  siblingBlock: '77777777-7777-4777-8777-777777777704',
  foreignBlock: '77777777-7777-4777-8777-777777777705',
  ministryTwo: '33333333-3333-4333-8333-333333333341',
  ministryThree: '33333333-3333-4333-8333-333333333342',
};

const clock = (value: string) => parseTimeOfDay({ value });

const manualSplit = {
  kind: 'manual' as const,
  spans: [
    { label: 'Early', startTime: '09:00', endTime: '09:30' },
    { label: 'Late', startTime: '09:30', endTime: '10:00' },
  ],
};

interface EditGraph {
  seed: Awaited<ReturnType<typeof signIn>>;
  sectorId: string;
  roleId: string;
}

/**
 * Template with Welcome, Worship and an overnight Vigil; Ministry A uses
 * Welcome and Vigil, Ministry 2 Vigil (serves: false), Ministry 3 Worship.
 * A sibling and a foreign-Church template, and generated Draft/Sent Events
 * staffed from Vigil.
 */
async function seedEditGraph(): Promise<EditGraph> {
  const seed = await signIn();
  const db = schedulingTestDb;
  const churchId = seed.churchAId;
  await buildEventTemplate({
    db,
    churchId,
    id: ids.template,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        id: ids.welcome,
        label: 'Welcome',
        startTime: clock('09:00'),
        endTime: clock('10:00'),
      },
      {
        id: ids.worship,
        label: 'Worship',
        startTime: clock('10:00'),
        endTime: clock('11:00'),
      },
      {
        id: ids.vigil,
        label: 'Vigil',
        startTime: clock('22:00'),
        endTime: clock('01:00'),
      },
    ],
  });
  await buildEventTemplate({
    db,
    churchId,
    id: ids.sibling,
    name: 'Wednesday',
    weekday: 3,
    blocks: [
      {
        id: ids.siblingBlock,
        label: 'Prayer',
        startTime: clock('19:00'),
        endTime: clock('20:00'),
      },
    ],
  });
  await buildEventTemplate({
    db,
    churchId: seed.churchBId,
    id: ids.foreign,
    name: 'Foreign',
    weekday: 0,
    blocks: [
      {
        id: ids.foreignBlock,
        label: 'Welcome',
        startTime: clock('09:00'),
        endTime: clock('10:00'),
      },
    ],
  });
  for (const [id, name] of [
    [ids.ministryTwo, 'Ministry Two'],
    [ids.ministryThree, 'Ministry Three'],
  ] as const) {
    await buildMinistry({ db, churchId, id, name });
  }
  const sector = await buildSector({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Door',
  });
  const role = await buildRole({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Greeter',
  });
  const headcounts = [
    { sectorId: sector.id, roleId: role.id, peopleNeeded: 3 },
  ];
  const setups = [
    [seed.ministryAId, ids.welcome, true, manualSplit],
    [seed.ministryAId, ids.vigil, true, { kind: 'equal' as const, count: 2 }],
    [ids.ministryTwo, ids.vigil, false, { kind: 'equal' as const, count: 1 }],
    [
      ids.ministryThree,
      ids.worship,
      true,
      { kind: 'equal' as const, count: 1 },
    ],
  ] as const;
  for (const [ministryId, blockId, serves, shiftSplit] of setups) {
    await buildUsualSetup({
      db,
      churchId,
      ministryId,
      sourceTemplateTimeBlockId: blockId,
      id: crypto.randomUUID(),
      serves,
      shiftSplit,
      headcounts,
    });
  }
  for (const [state, month] of [
    ['draft', 11],
    ['sent', 10],
  ] as const) {
    const cycle = await createSchedulingPhase3Cycle({
      churchId,
      name: `Cycle ${state}`,
      startDate: new Date(Date.UTC(2026, month - 1, 1)),
      endDate: new Date(Date.UTC(2026, month - 1, 28)),
      state,
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      sourceTemplateId: ids.template,
      sourceTemplateTimeBlockId: ids.vigil,
      title: `Generated ${state}`,
      start: new Date('2026-11-08T01:00:00Z'),
      end: new Date('2026-11-08T04:00:00Z'),
    });
    const generatedShift = await buildShift({
      db,
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    });
    const requirement = await buildShiftRequirement({
      db,
      churchId,
      participationId: graph.participation.id,
      shiftId: generatedShift.id,
      roleId: role.id,
      sectorId: sector.id,
      peopleNeeded: 2,
    });
    await buildAssignment({
      db,
      churchId,
      participationId: graph.participation.id,
      shiftId: generatedShift.id,
      volunteerId: seed.adminVolunteerId,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status: 'confirmed',
    });
  }
  return { seed, sectorId: sector.id, roleId: role.id };
}

function getDetail(templateId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/admin/event-templates/${templateId}`,
  });
}

function getUsage(templateId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/admin/event-templates/${templateId}/usage`,
  });
}

async function setupRows() {
  return (await schedulingTestDb.select().from(usualSetup)).map(
    ({
      ministryId,
      sourceTemplateTimeBlockId,
      serves,
      shiftSplit,
      headcounts,
    }) => ({
      ministryId,
      sourceTemplateTimeBlockId,
      serves,
      shiftSplit,
      headcounts,
    }),
  );
}

async function blockRows() {
  return (
    await schedulingTestDb
      .select()
      .from(templateTimeBlock)
      .orderBy(templateTimeBlock.templateId, templateTimeBlock.order)
  ).map(({ id, templateId, label, startTime, endTime, order }) => ({
    id,
    templateId,
    label,
    startTime,
    endTime,
    order,
  }));
}

async function storedState() {
  return {
    templates: await schedulingTestDb
      .select()
      .from(eventTemplate)
      .orderBy(eventTemplate.id),
    blocks: await blockRows(),
    setups: await setupRows(),
    eventTimeBlocks: await schedulingTestDb.select().from(eventTimeBlock),
  };
}

describe('GET /event-templates/:templateId', () => {
  it('returns the scoped template with its ordered blocks', async () => {
    await seedEditGraph();

    const res = await getDetail(ids.template);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: ids.template,
      name: 'Sunday',
      weekday: 0,
      blocks: [
        { id: ids.welcome, order: 0, startTime: '09:00', endTime: '10:00' },
        { id: ids.worship, order: 1 },
        { id: ids.vigil, order: 2, endTime: '01:00' },
      ],
    });
  });

  it.each([
    ['another Church', ids.foreign],
    ['a missing id', '99999999-9999-4999-8999-999999999999'],
    ['a malformed id', 'not-a-uuid'],
  ])('answers 404 NOT_FOUND for %s, alike for detail and usage', async (_case, templateId) => {
    await seedEditGraph();

    for (const res of [
      await getDetail(templateId),
      await getUsage(templateId),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
    }
  });
});

describe('GET /event-templates/:templateId/usage', () => {
  it('counts distinct Ministries per block, including serves:false and zeros, and their union for the template', async () => {
    await seedEditGraph();

    const usage = (await getUsage(ids.template)).json();

    expect(usage).toEqual({
      templateId: ids.template,
      ministryCount: 3,
      blocks: [
        { blockId: ids.welcome, ministryCount: 1 },
        { blockId: ids.worship, ministryCount: 1 },
        { blockId: ids.vigil, ministryCount: 2 },
      ],
    });
    expect((await getUsage(ids.sibling)).json()).toEqual({
      templateId: ids.sibling,
      ministryCount: 0,
      blocks: [{ blockId: ids.siblingBlock, ministryCount: 0 }],
    });
  });
});

describe('PATCH /event-templates/:templateId identity', () => {
  it('keeps retained ids and Usual setup through rename, weekday, retime, reorder and a label swap, adds new ids and removes only omitted blocks and their setup', async () => {
    await seedEditGraph();
    const before = await storedState();

    const res = await patch({
      templateId: ids.template,
      payload: {
        name: 'Sunday renamed',
        weekday: 6,
        blocks: [
          // Welcome and Worship swap labels and move after a new early block.
          {
            id: ids.welcome,
            label: 'Worship',
            startTime: '12:00',
            endTime: '13:00',
          },
          {
            id: ids.worship,
            label: 'Welcome',
            startTime: '10:00',
            endTime: '11:30',
          },
          { label: 'Doors', startTime: '08:00', endTime: '09:00' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const saved = res.json();
    expect(saved).toMatchObject({ name: 'Sunday renamed', weekday: 6 });
    expect(
      saved.blocks.map(
        (b: { label: string; order: number }) => `${b.order}:${b.label}`,
      ),
    ).toEqual(['0:Doors', '1:Welcome', '2:Worship']);
    const [doors, worshipRow, welcomeRow] = saved.blocks;
    expect(worshipRow.id).toBe(ids.worship);
    expect(welcomeRow.id).toBe(ids.welcome);
    expect(Object.values(ids)).not.toContain(doors.id);

    const after = await storedState();
    // Retained setup is untouched; only the omitted Vigil's entries are gone.
    expect(after.setups).toEqual(
      before.setups.filter(
        (row) => row.sourceTemplateTimeBlockId !== ids.vigil,
      ),
    );
    expect(
      after.setups.some((row) => row.sourceTemplateTimeBlockId === doors.id),
    ).toBe(false);
    // Sibling and foreign templates keep their blocks.
    expect(after.blocks.filter((b) => b.templateId !== ids.template)).toEqual(
      before.blocks.filter((b) => b.templateId !== ids.template),
    );
    // Generated data stays; only the removed block's source link is cleared.
    expect(after.eventTimeBlocks).toHaveLength(2);
    expect(
      after.eventTimeBlocks.map((b) => b.sourceTemplateTimeBlockId),
    ).toEqual([null, null]);
    expect(
      after.eventTimeBlocks.map(
        ({ sourceTemplateTimeBlockId: _, ...rest }) => rest,
      ),
    ).toEqual(
      before.eventTimeBlocks.map(
        ({ sourceTemplateTimeBlockId: _, ...rest }) => rest,
      ),
    );
    const events = await schedulingTestDb.select().from(event);
    expect(events.map((e) => e.sourceTemplateId)).toEqual([
      ids.template,
      ids.template,
    ]);
    expect(await schedulingTestDb.select().from(shift)).toHaveLength(2);
    expect(await schedulingTestDb.select().from(shiftRequirement)).toHaveLength(
      2,
    );
    expect(await schedulingTestDb.select().from(assignment)).toHaveLength(2);

    expect((await getUsage(ids.template)).json()).toEqual({
      templateId: ids.template,
      ministryCount: 2,
      blocks: [
        { blockId: doors.id, ministryCount: 0 },
        { blockId: ids.worship, ministryCount: 1 },
        { blockId: ids.welcome, ministryCount: 1 },
      ],
    });
  });

  it('refuses repeated supplied ids with 422 VALIDATION_ERROR and writes nothing', async () => {
    await seedEditGraph();
    const before = await storedState();

    const res = await patch({
      templateId: ids.template,
      payload: body({
        blocks: [
          { ...welcome, id: ids.welcome },
          {
            label: 'Again',
            startTime: '11:00',
            endTime: '12:00',
            id: ids.welcome.toUpperCase(),
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
    expect(await storedState()).toEqual(before);
  });

  it.each([
    ['a stale id', '99999999-9999-4999-8999-999999999999'],
    ['another template block id', ids.siblingBlock],
    ['another Church block id', ids.foreignBlock],
  ])('refuses %s with the same 404 NOT_FOUND and writes nothing', async (_case, blockId) => {
    await seedEditGraph();
    const before = await storedState();

    const res = await patch({
      templateId: ids.template,
      payload: body({ name: 'Changed', blocks: [{ ...welcome, id: blockId }] }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
    expect(await storedState()).toEqual(before);
  });

  it('answers 404 for a foreign-Church template and leaves it untouched', async () => {
    await seedEditGraph();
    const before = await storedState();

    const res = await patch({
      templateId: ids.foreign,
      payload: body({ blocks: [{ ...welcome, id: ids.foreignBlock }] }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
    expect(await storedState()).toEqual(before);
  });

  it('rolls back the parent, removals and cascaded setup when a later block write fails', async () => {
    await seedEditGraph();
    const before = await storedState();

    // NUL passes request validation but PostgreSQL rejects the block update.
    const res = await patch({
      templateId: ids.template,
      payload: body({
        name: 'Never stored',
        blocks: [{ ...welcome, id: ids.welcome, label: 'Bad\u0000label' }],
      }),
    });

    expect(res.statusCode).toBe(500);
    expect(await storedState()).toEqual(before);
  });

  it('serializes concurrent edits so each applies a whole validated state and labels stay unique', async () => {
    await seedEditGraph();
    const keep = [
      { ...welcome, id: ids.welcome },
      {
        label: 'Worship',
        startTime: '10:00',
        endTime: '11:00',
        id: ids.worship,
      },
      { label: 'Vigil', startTime: '22:00', endTime: '01:00', id: ids.vigil },
    ];

    const results = await Promise.all([
      patch({
        templateId: ids.template,
        payload: body({
          blocks: [
            ...keep,
            { label: 'Extra', startTime: '12:00', endTime: '13:00' },
          ],
        }),
      }),
      patch({
        templateId: ids.template,
        payload: body({
          blocks: [
            ...keep,
            { label: 'EXTRA', startTime: '14:00', endTime: '15:00' },
          ],
        }),
      }),
    ]);

    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const labels = (await blockRows())
      .filter((b) => b.templateId === ids.template)
      .map((b) => b.label.toLowerCase());
    expect(labels).toHaveLength(4);
    expect(new Set(labels).size).toBe(4);
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
    expect((await getDetail(ids.template)).statusCode).toBe(403);
    expect((await getUsage(ids.template)).statusCode).toBe(403);
    expect(
      (await patch({ templateId: ids.template, payload: body() })).statusCode,
    ).toBe(403);
    expect(await storedTemplateCount()).toBe(0);
  });
});
