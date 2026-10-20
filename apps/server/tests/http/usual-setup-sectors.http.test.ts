import { randomUUID } from 'node:crypto';
import { usualSetup } from '@church/db';
import { m } from '@church/i18n/messages';
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
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  createSchedulingManagers,
  seedRole,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = { canManageChurch: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify();
  const controller = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: {} as never,
    planningEventManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    participationManager: managers.participationManager,
    ministryManager: {} as never,
    authorityGuard: authorityGuard as never,
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

/** Ministry A with a template block, two Sectors and a Role, plus a Sector of another Ministry. */
async function seedUsualSetupMinistry() {
  const seed = await seedSchedulingPhase3Base();
  mockGetSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: seed.churchAId,
    volunteerId: seed.adminVolunteerId,
    autoSelected: false,
  });
  authorityGuard.canManageChurch.mockResolvedValue(true);

  const template = await buildEventTemplate({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Morning',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '11:00' }),
        order: 1,
      },
    ],
  });
  const [block] = template.blocks;
  if (!block) throw new Error('block seed failed');
  const foreignTemplate = await buildEventTemplate({
    db: schedulingTestDb,
    churchId: seed.churchBId,
    name: 'Foreign Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Morning',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '11:00' }),
        order: 1,
      },
    ],
  });
  const [foreignBlock] = foreignTemplate.blocks;
  if (!foreignBlock) throw new Error('foreign block seed failed');
  const teacher = await seedRole({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Teacher',
  });
  const babiesRoom = await buildSector({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Babies Room',
  });
  const kidsRoom = await buildSector({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Kids Room',
  });
  const otherMinistry = await buildMinistry({
    db: schedulingTestDb,
    id: randomUUID(),
    churchId: seed.churchAId,
    name: 'Other ministry',
  });
  const foreignSector = await buildSector({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    ministryId: otherMinistry.id,
    name: 'Main Door',
  });

  return {
    ministryId: seed.ministryAId,
    blockId: block.id,
    teacherId: teacher.id,
    babiesRoomId: babiesRoom.id,
    kidsRoomId: kidsRoom.id,
    foreignSectorId: foreignSector.id,
    foreignChurchMinistryId: seed.ministryBId,
    foreignBlockId: foreignBlock.id,
  };
}

interface HeadcountBody {
  sectorId?: string;
  roleId: string;
  peopleNeeded: number;
}

interface PutUsualSetupInput {
  ministryId: string;
  blockId: string;
  headcounts: HeadcountBody[];
}

async function putUsualSetup({
  ministryId,
  blockId,
  headcounts,
}: PutUsualSetupInput) {
  return await app.inject({
    method: 'PUT',
    url: `/api/v1/admin/ministries/${ministryId}/usual-setup`,
    payload: {
      entries: [
        {
          sourceTemplateTimeBlockId: blockId,
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts,
        },
      ],
    },
  });
}

describe('PUT /admin/ministries/:ministryId/usual-setup on Sectors', () => {
  it('stores and returns each headcount with its Sector', async () => {
    const seed = await seedUsualSetupMinistry();
    const headcounts = [
      { sectorId: seed.babiesRoomId, roleId: seed.teacherId, peopleNeeded: 1 },
      { sectorId: seed.kidsRoomId, roleId: seed.teacherId, peopleNeeded: 2 },
    ];

    const response = await putUsualSetup({ ...seed, headcounts });
    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/ministries/${seed.ministryId}/usual-setup`,
    });

    expect(response.statusCode).toBe(200);
    expect(read.json().entries[0].headcounts).toEqual(headcounts);
  });

  it('refuses the same Sector and Role twice in one entry', async () => {
    const seed = await seedUsualSetupMinistry();
    const twice = {
      sectorId: seed.babiesRoomId,
      roleId: seed.teacherId,
      peopleNeeded: 1,
    };

    const response = await putUsualSetup({
      ...seed,
      headcounts: [twice, { ...twice, peopleNeeded: 2 }],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('refuses a Sector of another Ministry with 404', async () => {
    const seed = await seedUsualSetupMinistry();

    const response = await putUsualSetup({
      ...seed,
      headcounts: [
        {
          sectorId: seed.foreignSectorId,
          roleId: seed.teacherId,
          peopleNeeded: 1,
        },
      ],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('rejects a headcount without a Sector', async () => {
    const seed = await seedUsualSetupMinistry();

    const response = await putUsualSetup({
      ...seed,
      headcounts: [{ roleId: seed.teacherId, peopleNeeded: 1 }],
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('/admin/ministries/:ministryId/usual-setup Ministry scope', () => {
  it('returns the same 404 for a missing and a foreign-Church Ministry, and writes nothing', async () => {
    const seed = await seedUsualSetupMinistry();
    const missingMinistryId = randomUUID();
    const read = (ministryId: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/admin/ministries/${ministryId}/usual-setup`,
      });
    const write = (ministryId: string) =>
      putUsualSetup({ ministryId, blockId: seed.blockId, headcounts: [] });

    for (const response of [
      await read(missingMinistryId),
      await read(seed.foreignChurchMinistryId),
      await write(missingMinistryId),
      await write(seed.foreignChurchMinistryId),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('NOT_FOUND');
    }
    expect((await read(missingMinistryId)).json().message).toBe(
      m.error_not_found(),
    );
    expect((await read(seed.foreignChurchMinistryId)).json().message).toBe(
      m.error_not_found(),
    );
    const foreignRows = await schedulingTestDb
      .select()
      .from(usualSetup)
      .where(eq(usualSetup.ministryId, seed.foreignChurchMinistryId));
    expect(foreignRows).toHaveLength(0);
  });
});

describe('/admin/ministries/:ministryId/usual-setup TemplateTimeBlock scope', () => {
  it('returns the same 404 for a missing and a foreign-Church block, and writes nothing', async () => {
    const seed = await seedUsualSetupMinistry();
    const kept = await putUsualSetup({
      ministryId: seed.ministryId,
      blockId: seed.blockId,
      headcounts: [],
    });
    expect(kept.statusCode).toBe(200);
    const rowsBefore = await schedulingTestDb.select().from(usualSetup);
    const missingBlockId = randomUUID();

    for (const blockId of [missingBlockId, seed.foreignBlockId]) {
      const response = await putUsualSetup({
        ministryId: seed.ministryId,
        blockId,
        headcounts: [],
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('NOT_FOUND');
      expect(response.json().message).toBe(m.error_not_found());
    }
    expect(await schedulingTestDb.select().from(usualSetup)).toEqual(
      rowsBefore,
    );
  });
});
