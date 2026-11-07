import { randomUUID } from 'node:crypto';
import { sector, shiftRequirement } from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
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
import { PrepareController } from '@/api/controllers/prepare-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import {
  createSchedulingManagers,
  seedRole,
  seedShift,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = {
  decideManageAnyMinistry: vi.fn(),
  decideManageParticipation: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify({ locale: testLocale });
  const controller = new PrepareController({
    participationManager: managers.participationManager,
    availabilityCheckManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
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
  resetClock();
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: '2026-09-01T00:00:00Z' }) });
  await resetSchedulingPhase3Db();
});

/** A preparing Shift of Ministry A with two Sectors and a Role, plus a foreign Ministry's Sector and Role. */
async function seedPreparingShift() {
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
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageParticipation.mockResolvedValue({ allowed: true });

  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Sunday service',
    start: new Date('2026-09-07T09:00:00.000Z'),
    end: new Date('2026-09-07T11:00:00.000Z'),
    status: 'scheduled',
  });
  const shift = await seedShift({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: new Date('2026-09-07T09:00:00.000Z'),
    endTime: new Date('2026-09-07T10:00:00.000Z'),
    label: 'Morning',
  });
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
  const foreignRole = await seedRole({
    churchId: seed.churchAId,
    ministryId: otherMinistry.id,
    name: 'Usher',
  });
  const otherChurchSector = await buildSector({
    db: schedulingTestDb,
    churchId: seed.churchBId,
    ministryId: seed.ministryBId,
    name: 'Stage',
  });

  return {
    shiftId: shift.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    participationId: graph.participation.id,
    teacherId: teacher.id,
    babiesRoomId: babiesRoom.id,
    kidsRoomId: kidsRoom.id,
    foreignSectorId: foreignSector.id,
    foreignRoleId: foreignRole.id,
    otherChurchSectorId: otherChurchSector.id,
  };
}

interface SaveHeadcountsInput {
  seed: Awaited<ReturnType<typeof seedPreparingShift>>;
  headcounts: Record<string, unknown>[];
}

async function saveHeadcounts({ seed, headcounts }: SaveHeadcountsInput) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/prepare/participations/${seed.participationId}/event-time-blocks/${seed.eventTimeBlockId}/preparation`,
    payload: {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            startTime: '2026-09-07T09:00:00.000Z',
            endTime: '2026-09-07T10:00:00.000Z',
            label: 'Morning',
          },
        ],
      },
      headcounts: headcounts.map((entry) => ({ shiftIndex: 0, ...entry })),
    },
  });
}

describe('block preparation headcounts on Sectors', () => {
  it('creates a requirement for a Sector of the Ministry and returns its Sector', async () => {
    const seed = await seedPreparingShift();

    const response = await saveHeadcounts({
      seed,
      headcounts: [
        {
          sectorId: seed.babiesRoomId,
          roleId: seed.teacherId,
          peopleNeeded: 1,
        },
      ],
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().requirements[0]).toMatchObject({
      shiftId: seed.shiftId,
      sectorId: seed.babiesRoomId,
      sectorName: 'Babies Room',
      roleId: seed.teacherId,
      peopleNeeded: 1,
    });
  });

  it('updates the existing requirement on the same Shift, Sector and Role', async () => {
    const seed = await seedPreparingShift();
    const payload = { sectorId: seed.babiesRoomId, roleId: seed.teacherId };
    const created = await saveHeadcounts({
      seed,
      headcounts: [{ ...payload, peopleNeeded: 1 }],
    });

    const updated = await saveHeadcounts({
      seed,
      headcounts: [{ ...payload, peopleNeeded: 3 }],
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().requirements[0]).toMatchObject({
      id: created.json().requirements[0].id,
      peopleNeeded: 3,
    });
  });

  it('keeps the same Role at two Sectors as two requirements', async () => {
    const seed = await seedPreparingShift();
    const response = await saveHeadcounts({
      seed,
      headcounts: [
        {
          sectorId: seed.babiesRoomId,
          roleId: seed.teacherId,
          peopleNeeded: 1,
        },
        { sectorId: seed.kidsRoomId, roleId: seed.teacherId, peopleNeeded: 2 },
      ],
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sectorName: 'Babies Room', peopleNeeded: 1 }),
        expect.objectContaining({ sectorName: 'Kids Room', peopleNeeded: 2 }),
      ]),
    );
    expect(response.json().requirements).toHaveLength(2);
  });

  it.each([
    ['another Ministry', 'foreignSectorId'],
    ['another Church', 'otherChurchSectorId'],
  ] as const)('refuses a Sector of %s with 404', async (_label, sectorKey) => {
    const seed = await seedPreparingShift();

    const response = await saveHeadcounts({
      seed,
      headcounts: [
        {
          sectorId: seed[sectorKey],
          roleId: seed.teacherId,
          peopleNeeded: 1,
        },
      ],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('refuses an archived Sector of the Ministry with 404 and writes nothing', async () => {
    const seed = await seedPreparingShift();
    await schedulingTestDb
      .update(sector)
      .set({ archivedAt: new Date() })
      .where(eq(sector.id, seed.babiesRoomId));

    const response = await saveHeadcounts({
      seed,
      headcounts: [
        {
          sectorId: seed.babiesRoomId,
          roleId: seed.teacherId,
          peopleNeeded: 1,
        },
      ],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(
      await schedulingTestDb
        .select()
        .from(shiftRequirement)
        .where(eq(shiftRequirement.sectorId, seed.babiesRoomId)),
    ).toEqual([]);
  });

  it('refuses a Role of another Ministry with 404', async () => {
    const seed = await seedPreparingShift();

    const response = await saveHeadcounts({
      seed,
      headcounts: [
        {
          sectorId: seed.babiesRoomId,
          roleId: seed.foreignRoleId,
          peopleNeeded: 1,
        },
      ],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('rejects a body without a Sector', async () => {
    const seed = await seedPreparingShift();

    const response = await saveHeadcounts({
      seed,
      headcounts: [{ roleId: seed.teacherId, peopleNeeded: 1 }],
    });

    expect(response.statusCode).toBe(422);
  });
});
