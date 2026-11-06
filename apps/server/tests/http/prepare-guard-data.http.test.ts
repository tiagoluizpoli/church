import { randomUUID } from 'node:crypto';
import {
  availabilityCheck,
  eventTimeBlock,
  ministryParticipation,
  shift,
} from '@church/db';
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
import { buildSector } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  createSchedulingPhase3Template,
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
const authorityGuard = { decideManageMinistry: vi.fn() };

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
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
});

const BLOCK_START = new Date('2026-09-07T09:00:00.000Z');
const BLOCK_END = new Date('2026-09-07T12:00:00.000Z');
const FIRST_SHIFT_END = new Date('2026-09-07T10:00:00.000Z');
const SECOND_SHIFT_END = new Date('2026-09-07T11:00:00.000Z');
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');

async function seedBase() {
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
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    state: 'sent',
  });
  return { seed, cycle };
}

type Base = Awaited<ReturnType<typeof seedBase>>;

interface SeedEventInput {
  base: Base;
  title: string;
  sourceTemplateId?: string;
}

async function seedEvent({ base, title, sourceTemplateId }: SeedEventInput) {
  const { seed, cycle } = base;
  return await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    sourceTemplateId,
    title,
    start: BLOCK_START,
    end: BLOCK_END,
    status: 'scheduled',
  });
}

async function getView(base: Base) {
  const { seed, cycle } = base;
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/prepare/cycles/${cycle.id}/participation?ministryId=${seed.ministryAId}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe('GET /prepare/cycles/:cycleId/participation guard data', () => {
  it('counts marks and active Assignments per Shift and flags a Shift with no requirements', async () => {
    const base = await seedBase();
    const { seed, cycle } = base;
    const graph = await seedEvent({ base, title: 'Sunday service' });
    const churchId = seed.churchAId;
    const participationId = graph.participation.id;
    const eventTimeBlockId = graph.eventTimeBlock.id;
    const staffed = await seedShift({
      churchId,
      participationId,
      eventTimeBlockId,
      startTime: BLOCK_START,
      endTime: FIRST_SHIFT_END,
      label: 'Staffed',
    });
    const empty = await seedShift({
      churchId,
      participationId,
      eventTimeBlockId,
      startTime: FIRST_SHIFT_END,
      endTime: SECOND_SHIFT_END,
      label: 'Empty',
    });
    const teacher = await seedRole({
      churchId,
      ministryId: seed.ministryAId,
      name: 'Teacher',
    });
    const room = await buildSector({
      db: schedulingTestDb,
      churchId,
      ministryId: seed.ministryAId,
      name: 'Kids Room',
    });
    const requirement = await seedRequirement({
      churchId,
      participationId,
      shiftId: staffed.id,
      roleId: teacher.id,
      sectorId: room.id,
      peopleNeeded: 4,
    });
    const volunteers = await Promise.all(
      [1, 2, 3, 4, 5].map((index) =>
        seedVolunteerMembership({
          churchId,
          ministryId: seed.ministryAId,
          name: `Volunteer ${index}`,
          email: `volunteer-${index}-${randomUUID()}@test.com`,
        }),
      ),
    );
    const volunteerAt = (index: number) => {
      const seeded = volunteers[index];
      if (!seeded) throw new Error(`Volunteer ${index} was not seeded`);
      return seeded;
    };
    const statuses = [
      'confirmed',
      'pending',
      'cancelled',
      'declined',
      'draft',
    ] as const;
    for (const [index, status] of statuses.entries()) {
      await buildAssignment({
        db: schedulingTestDb,
        churchId,
        participationId,
        shiftId: staffed.id,
        volunteerId: volunteerAt(index).volunteer.id,
        roleId: teacher.id,
        shiftRequirementId: requirement.id,
        status,
      });
    }
    for (const [index, markedShiftId] of [
      [0, staffed.id],
      [1, staffed.id],
      [2, empty.id],
    ] as const) {
      const check = await buildAvailabilityCheck({
        db: schedulingTestDb,
        churchId,
        cycleId: cycle.id,
        ministryMembershipId: volunteerAt(index).membership.id,
        state: 'confirmed',
      });
      await buildUnavailableShift({
        db: schedulingTestDb,
        churchId,
        availabilityCheckId: check.id,
        shiftId: markedShiftId,
      });
    }

    const body = await getView(base);

    const [block] = body.events[0].eventTimeBlocks;
    const byLabel = Object.fromEntries(
      block.shifts.map((view: { label: string }) => [view.label, view]),
    );
    expect(byLabel.Staffed).toMatchObject({
      id: staffed.id,
      unavailableMarkCount: 2,
      assignmentCount: 3,
      flagged: false,
      requirements: [{ id: requirement.id, assignedCount: 3 }],
    });
    expect(byLabel.Empty).toMatchObject({
      id: empty.id,
      unavailableMarkCount: 1,
      assignmentCount: 0,
      flagged: true,
      requirements: [],
    });
    expect(block.requirements).toMatchObject([
      { id: requirement.id, assignedCount: 3 },
    ]);
  });

  it('tells generated Events from one-off Events', async () => {
    const base = await seedBase();
    const { template } = await createSchedulingPhase3Template({
      churchId: base.seed.churchAId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [],
    });
    await seedEvent({
      base,
      title: 'Generated',
      sourceTemplateId: template.id,
    });
    await seedEvent({ base, title: 'One-off' });

    const body = await getView(base);

    const flags = Object.fromEntries(
      body.events.map(
        (view: {
          event: { title: string };
          generatedFromTemplate: boolean;
        }) => [view.event.title, view.generatedFromTemplate],
      ),
    );
    expect(flags).toEqual({ Generated: true, 'One-off': false });
  });

  it('flags only Shifts created after availability was requested', async () => {
    const base = await seedBase();
    const { seed, cycle } = base;
    const churchId = seed.churchAId;
    const graph = await seedEvent({ base, title: 'Sunday service' });
    const participationId = graph.participation.id;
    const eventTimeBlockId = graph.eventTimeBlock.id;
    const [lateBlock] = await schedulingTestDb
      .insert(eventTimeBlock)
      .values({
        churchId,
        eventId: graph.event.id,
        startTime: BLOCK_START,
        endTime: BLOCK_END,
        label: 'Late block',
      })
      .returning();
    if (!lateBlock) throw new Error('Late block was not seeded');
    const early = await seedShift({
      churchId,
      participationId,
      eventTimeBlockId,
      startTime: BLOCK_START,
      endTime: FIRST_SHIFT_END,
      label: 'Early',
    });
    await schedulingTestDb
      .update(shift)
      .set({ createdAt: LONG_AGO })
      .where(eq(shift.id, early.id));
    const { membership } = await seedVolunteerMembership({
      churchId,
      ministryId: seed.ministryAId,
      name: 'Asked',
      email: `asked-${randomUUID()}@test.com`,
    });

    const beforeAsk = await getView(base);
    expect(beforeAsk.events[0].eventTimeBlocks[0].shiftsChangedAfterAsk).toBe(
      false,
    );

    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'availability_requested' })
      .where(eq(ministryParticipation.id, participationId));
    const check = await buildAvailabilityCheck({
      db: schedulingTestDb,
      churchId,
      cycleId: cycle.id,
      ministryMembershipId: membership.id,
    });
    await seedShift({
      churchId,
      participationId,
      eventTimeBlockId: lateBlock.id,
      startTime: BLOCK_START,
      endTime: FIRST_SHIFT_END,
      label: 'Late',
    });
    await schedulingTestDb
      .update(availabilityCheck)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(availabilityCheck.id, check.id));

    const afterAsk = await getView(base);

    const flagsByBlock = Object.fromEntries(
      afterAsk.events[0].eventTimeBlocks.map(
        (block: {
          eventTimeBlock: { id: string };
          shiftsChangedAfterAsk: boolean;
        }) => [block.eventTimeBlock.id, block.shiftsChangedAfterAsk],
      ),
    );
    expect(flagsByBlock).toEqual({
      [eventTimeBlockId]: false,
      [lateBlock.id]: true,
    });
  });
});
