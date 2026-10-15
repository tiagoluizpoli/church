import { randomUUID } from 'node:crypto';
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

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = {
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageMinistry: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify();
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
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
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
  authorityGuard.canManageShift.mockResolvedValue(true);

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
    participationId: graph.participation.id,
    teacherId: teacher.id,
    babiesRoomId: babiesRoom.id,
    kidsRoomId: kidsRoom.id,
    foreignSectorId: foreignSector.id,
    foreignRoleId: foreignRole.id,
    otherChurchSectorId: otherChurchSector.id,
  };
}

interface PutRequirementInput {
  shiftId: string;
  payload: Record<string, unknown>;
}

async function putRequirement({ shiftId, payload }: PutRequirementInput) {
  return await app.inject({
    method: 'PUT',
    url: `/api/v1/prepare/shifts/${shiftId}/requirements`,
    payload,
  });
}

describe('PUT /prepare/shifts/:shiftId/requirements on Sectors', () => {
  it('creates a requirement for a Sector of the Ministry and returns its Sector', async () => {
    const seed = await seedPreparingShift();

    const response = await putRequirement({
      shiftId: seed.shiftId,
      payload: {
        sectorId: seed.babiesRoomId,
        roleId: seed.teacherId,
        peopleNeeded: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
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
    const created = await putRequirement({
      shiftId: seed.shiftId,
      payload: { ...payload, peopleNeeded: 1 },
    });

    const updated = await putRequirement({
      shiftId: seed.shiftId,
      payload: { ...payload, peopleNeeded: 3 },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: created.json().id,
      peopleNeeded: 3,
    });
  });

  it('keeps the same Role at two Sectors as two requirements', async () => {
    const seed = await seedPreparingShift();

    const babies = await putRequirement({
      shiftId: seed.shiftId,
      payload: {
        sectorId: seed.babiesRoomId,
        roleId: seed.teacherId,
        peopleNeeded: 1,
      },
    });
    const kids = await putRequirement({
      shiftId: seed.shiftId,
      payload: {
        sectorId: seed.kidsRoomId,
        roleId: seed.teacherId,
        peopleNeeded: 2,
      },
    });

    expect(kids.json().id).not.toBe(babies.json().id);
    expect(kids.json()).toMatchObject({
      sectorName: 'Kids Room',
      peopleNeeded: 2,
    });
    expect(babies.json()).toMatchObject({
      sectorName: 'Babies Room',
      peopleNeeded: 1,
    });
  });

  it.each([
    ['another Ministry', 'foreignSectorId'],
    ['another Church', 'otherChurchSectorId'],
  ] as const)('refuses a Sector of %s with 404', async (_label, sectorKey) => {
    const seed = await seedPreparingShift();

    const response = await putRequirement({
      shiftId: seed.shiftId,
      payload: {
        sectorId: seed[sectorKey],
        roleId: seed.teacherId,
        peopleNeeded: 1,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('refuses a Role of another Ministry with 404', async () => {
    const seed = await seedPreparingShift();

    const response = await putRequirement({
      shiftId: seed.shiftId,
      payload: {
        sectorId: seed.babiesRoomId,
        roleId: seed.foreignRoleId,
        peopleNeeded: 1,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('rejects a body without a Sector', async () => {
    const seed = await seedPreparingShift();

    const response = await putRequirement({
      shiftId: seed.shiftId,
      payload: { roleId: seed.teacherId, peopleNeeded: 1 },
    });

    expect(response.statusCode).toBe(422);
  });
});
