import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@church/core';
import {
  assignment,
  cycle as cycleTable,
  event as eventTable,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  role as roleTable,
  sector as sectorTable,
  shift,
  shiftRequirement,
  unavailableShift,
} from '@church/db';
import { m } from '@church/i18n/messages';
import { parseTimeOfDay } from '@church/time';
import { asc, eq, sql } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import {
  ChurchId,
  CycleId,
  MinistryId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import { buildUsualSetup } from '@/seeds/builders/planning';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
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
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));

const { auth: mockAuth } = await import('@/main/di/server-auth');
const mockGetSession = vi.mocked(mockAuth.api.getSession);
const mockSetActiveOrganization = vi.mocked(mockAuth.api.setActiveOrganization);

const db = schedulingTestDb;

let app: FastifyTypedInstance;
const { assignmentManager, participationManager } = createSchedulingManagers();

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories, resolver and AuthorityService: only the
  // Better Auth session is a seam.
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const controller = new PrepareController({
    participationManager,
    availabilityCheckManager: {} as never,
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
        scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: new DrizzleMinistryRepository({ db }),
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
  mockSetActiveOrganization.mockResolvedValue(null as never);
  await resetSchedulingPhase3Db();
});

const BLOCK_START = '2099-03-01T09:00:00.000Z';
const BLOCK_MIDDLE = '2099-03-01T10:00:00.000Z';
const BLOCK_END = '2099-03-01T11:00:00.000Z';
const LOCK_WAIT_TIMEOUT_MS = 5_000;
const LOCK_WAIT_POLL_MS = 20;

interface SignInInput {
  userId: string;
  churchId: string;
}

function signIn({ userId, churchId }: SignInInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: churchId },
  } as never);
}

/** A Sent Cycle's block of Ministry A, signed in as an admin with no Volunteer profile. */
async function seedPreparation() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const adminUserId = randomUUID();
  await buildUser({
    db,
    id: adminUserId,
    name: 'Admin',
    email: `${adminUserId}@test.com`,
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: adminUserId,
    accessLevel: 'admin',
  });
  signIn({ userId: adminUserId, churchId });
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'March 2099',
    startDate: new Date('2099-03-01T00:00:00.000Z'),
    endDate: new Date('2099-03-31T00:00:00.000Z'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Sunday service',
    start: new Date(BLOCK_START),
    end: new Date(BLOCK_END),
    status: 'scheduled',
  });
  const sector = await buildSector({
    db,
    churchId,
    ministryId,
    name: 'Babies Room',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  return {
    seed,
    churchId,
    ministryId,
    cycle,
    adminUserId,
    participationId: graph.participation.id,
    eventId: graph.event.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    sectorId: sector.id,
    roleId: role.id,
  };
}

interface BlockSignal {
  eventTimeBlock: { id: string };
  shiftsChangedAfterAsk: boolean;
}

interface SavePreparationInput {
  participationId: string;
  eventTimeBlockId: string;
  payload: Record<string, unknown>;
}

function savePreparation({
  participationId,
  eventTimeBlockId,
  payload,
}: SavePreparationInput) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/prepare/participations/${participationId}/event-time-blocks/${eventTimeBlockId}/preparation`,
    payload,
  });
}

function blockShifts(eventTimeBlockId: string) {
  return db
    .select()
    .from(shift)
    .where(eq(shift.eventTimeBlockId, eventTimeBlockId))
    .orderBy(asc(shift.startTime));
}

function shiftRequirements(shiftId: string) {
  return db
    .select()
    .from(shiftRequirement)
    .where(eq(shiftRequirement.shiftId, shiftId));
}

function blockInclusions(eventTimeBlockId: string) {
  return db
    .select()
    .from(participationEventTimeBlockInclusion)
    .where(
      eq(
        participationEventTimeBlockInclusion.eventTimeBlockId,
        eventTimeBlockId,
      ),
    );
}

type Base = Awaited<ReturnType<typeof seedPreparation>>;

interface SeedBlockShiftInput {
  base: Base;
  eventTimeBlockId?: string;
  startTime?: string;
  endTime?: string;
  peopleNeeded?: number;
}

/** A Shift with one requirement; included like a block prepared earlier. */
async function seedBlockShift({
  base,
  eventTimeBlockId = base.eventTimeBlockId,
  startTime = BLOCK_START,
  endTime = BLOCK_END,
  peopleNeeded = 2,
}: SeedBlockShiftInput) {
  const { churchId, participationId, sectorId, roleId } = base;
  const seeded = await seedShift({
    churchId,
    participationId,
    eventTimeBlockId,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    label: 'Whole block',
  });
  const requirement = await seedRequirement({
    churchId,
    participationId,
    shiftId: seeded.id,
    roleId,
    sectorId,
    peopleNeeded,
  });
  await db.insert(participationEventTimeBlockInclusion).values({
    churchId,
    participationId,
    eventTimeBlockId,
  });
  return { shift: seeded, requirement };
}

async function seedSecondBlock(base: Base) {
  const [block] = await db
    .insert(eventTimeBlock)
    .values({
      churchId: base.churchId,
      eventId: base.eventId,
      startTime: new Date(BLOCK_START),
      endTime: new Date(BLOCK_END),
      label: 'Second block',
    })
    .returning();
  if (!block) throw new Error('Second block was not seeded');
  return block;
}

interface HeadcountOverrides {
  shiftIndex?: number;
  sectorId?: string;
  roleId?: string;
  peopleNeeded?: number;
}

function headcountOf(base: Base, overrides: HeadcountOverrides = {}) {
  return {
    shiftIndex: 0,
    sectorId: base.sectorId,
    roleId: base.roleId,
    peopleNeeded: 2,
    ...overrides,
  };
}

function wholeBlockPayload(base: Base, overrides: HeadcountOverrides = {}) {
  return {
    serves: true,
    shiftSplit: { kind: 'equal', count: 1 },
    headcounts: [headcountOf(base, overrides)],
  };
}

function setParticipationState(
  base: Base,
  state: 'availability_requested' | 'assigning' | 'published',
) {
  return db
    .update(ministryParticipation)
    .set({ state })
    .where(eq(ministryParticipation.id, base.participationId));
}

interface SeedTemplatedBlockInput {
  base: Base;
  entry?: {
    serves: boolean;
    shiftSplit: Parameters<typeof buildUsualSetup>[0]['shiftSplit'];
    headcounts: Parameters<typeof buildUsualSetup>[0]['headcounts'];
  };
}

/** A block generated from a template, whose Ministry may have a Usual setup entry for it. */
async function seedTemplatedBlock({ base, entry }: SeedTemplatedBlockInput) {
  const { churchId, ministryId } = base;
  const { blocks } = await createSchedulingPhase3Template({
    churchId,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Service',
        startTime: parseTimeOfDay({ value: '06:00' }),
        endTime: parseTimeOfDay({ value: '08:00' }),
        order: 0,
      },
    ],
  });
  const [templateBlock] = blocks;
  if (!templateBlock) throw new Error('Template block was not seeded');
  if (entry) {
    await buildUsualSetup({
      db,
      churchId,
      ministryId,
      sourceTemplateTimeBlockId: templateBlock.id,
      id: randomUUID(),
      ...entry,
    });
  }
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: base.cycle.id,
    ministryId,
    sourceTemplateTimeBlockId: templateBlock.id,
    title: 'Generated service',
    start: new Date(BLOCK_START),
    end: new Date(BLOCK_END),
    status: 'scheduled',
  });
  return {
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
  };
}

function typedHeadcount(base: Base, shiftIndex: number, peopleNeeded: number) {
  return {
    shiftIndex,
    sectorId: base.sectorId,
    roleId: base.roleId,
    peopleNeeded,
  } as Parameters<typeof buildUsualSetup>[0]['headcounts'][number];
}

describe('PUT .../event-time-blocks/:eventTimeBlockId/preparation', () => {
  it('persists a served split with its headcounts and returns the block view', async () => {
    const base = await seedPreparation();

    const response = await savePreparation({
      ...base,
      payload: {
        serves: true,
        shiftSplit: { kind: 'equal', count: 2 },
        headcounts: [headcountOf(base, { shiftIndex: 1, peopleNeeded: 3 })],
      },
    });

    expect(response.statusCode).toBe(200);
    const [first, second] = await blockShifts(base.eventTimeBlockId);
    expect(first?.endTime).toEqual(new Date(BLOCK_MIDDLE));
    expect(second?.startTime).toEqual(new Date(BLOCK_MIDDLE));
    expect(await shiftRequirements(first?.id ?? '')).toEqual([]);
    expect(await shiftRequirements(second?.id ?? '')).toMatchObject([
      { sectorId: base.sectorId, roleId: base.roleId, peopleNeeded: 3 },
    ]);
    expect(await blockInclusions(base.eventTimeBlockId)).toHaveLength(1);
    expect(response.json()).toMatchObject({
      eventTimeBlock: { id: base.eventTimeBlockId },
      included: true,
      shifts: [
        { id: first?.id, flagged: true, requirements: [] },
        { id: second?.id, flagged: false, requirements: [{ peopleNeeded: 3 }] },
      ],
    });
  });

  describe('a served save', () => {
    it('replaces the Shifts when the split changes, leaving other blocks untouched', async () => {
      const base = await seedPreparation();
      const { shift: previous } = await seedBlockShift({ base });
      const other = await seedSecondBlock(base);
      const { shift: otherShift, requirement: otherRequirement } =
        await seedBlockShift({ base, eventTimeBlockId: other.id });

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: {
            kind: 'manual',
            spans: [
              {
                startTime: BLOCK_START,
                endTime: BLOCK_MIDDLE,
                label: 'First half',
              },
            ],
          },
          headcounts: [headcountOf(base)],
        },
      });

      expect(response.statusCode).toBe(200);
      const shifts = await blockShifts(base.eventTimeBlockId);
      expect(shifts).toMatchObject([
        { label: 'First half', endTime: new Date(BLOCK_MIDDLE) },
      ]);
      expect(shifts[0]?.id).not.toBe(previous.id);
      expect(await blockShifts(other.id)).toMatchObject([
        { id: otherShift.id },
      ]);
      expect(await shiftRequirements(otherShift.id)).toMatchObject([
        { id: otherRequirement.id, peopleNeeded: 2 },
      ]);
      expect(await blockInclusions(other.id)).toHaveLength(1);
    });

    it('keeps Shift labels, ids and requirement notes when only headcounts change', async () => {
      const base = await seedPreparation();
      const { shift: kept, requirement } = await seedBlockShift({ base });
      await db
        .update(shiftRequirement)
        .set({ notes: 'Bring keys' })
        .where(eq(shiftRequirement.id, requirement.id));

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base, { peopleNeeded: 7 }),
      });

      expect(response.statusCode).toBe(200);
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: kept.id, label: 'Whole block' },
      ]);
      expect(await shiftRequirements(kept.id)).toEqual([
        expect.objectContaining({
          id: requirement.id,
          peopleNeeded: 7,
          notes: 'Bring keys',
        }),
      ]);
    });

    it.each([
      ['omitted', []],
      ['zero', [{ peopleNeeded: 0 }]],
    ] as const)('removes a requirement whose pair is %s', async (_label, removed) => {
      const base = await seedPreparation();
      const { shift: kept, requirement } = await seedBlockShift({ base });
      const otherSector = await buildSector({
        db,
        churchId: base.churchId,
        ministryId: base.ministryId,
        name: 'Kids Room',
      });

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [
            headcountOf(base, { sectorId: otherSector.id }),
            ...removed.map((pair) => headcountOf(base, pair)),
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const requirements = await shiftRequirements(kept.id);
      expect(requirements).toMatchObject([{ sectorId: otherSector.id }]);
      expect(requirements[0]?.id).not.toBe(requirement.id);
    });

    it.each([
      ['Renamed', 'Renamed'],
      [undefined, null],
    ])('sets manual label %s without replacing the Shift', async (label, expectedLabel) => {
      const base = await seedPreparation();
      const { shift: kept } = await seedBlockShift({ base });

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: {
            kind: 'manual',
            spans: [{ startTime: BLOCK_START, endTime: BLOCK_END, label }],
          },
          headcounts: [headcountOf(base)],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: kept.id, label: expectedLabel },
      ]);
    });

    it('lands concurrent saves on different blocks and on one block leaves one graph', async () => {
      const base = await seedPreparation();
      const other = await seedSecondBlock(base);

      const [first, second, repeat] = await Promise.all([
        savePreparation({ ...base, payload: wholeBlockPayload(base) }),
        savePreparation({
          ...base,
          eventTimeBlockId: other.id,
          payload: wholeBlockPayload(base),
        }),
        savePreparation({
          ...base,
          eventTimeBlockId: other.id,
          payload: {
            serves: true,
            shiftSplit: { kind: 'equal', count: 2 },
            headcounts: [headcountOf(base)],
          },
        }),
      ]);

      expect([first.statusCode, second.statusCode, repeat.statusCode]).toEqual([
        200, 200, 200,
      ]);
      expect(await blockShifts(base.eventTimeBlockId)).toHaveLength(1);
      expect(await blockInclusions(base.eventTimeBlockId)).toHaveLength(1);
      expect([1, 2]).toContain((await blockShifts(other.id)).length);
      expect(await blockInclusions(other.id)).toHaveLength(1);
    });
  });

  describe('opting out', () => {
    it('discards the block graph and inclusion only', async () => {
      const base = await seedPreparation();
      const { shift: discarded } = await seedBlockShift({ base });
      const other = await seedSecondBlock(base);
      const { shift: otherShift } = await seedBlockShift({
        base,
        eventTimeBlockId: other.id,
      });

      const response = await savePreparation({
        ...base,
        payload: { serves: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ included: false, shifts: [] });
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
      expect(await shiftRequirements(discarded.id)).toEqual([]);
      expect(await blockInclusions(base.eventTimeBlockId)).toEqual([]);
      expect(await blockShifts(other.id)).toMatchObject([
        { id: otherShift.id },
      ]);
      expect(await blockInclusions(other.id)).toHaveLength(1);
    });
  });

  describe('opting in from nothing', () => {
    it('re-seeds from a serving Usual setup entry', async () => {
      const base = await seedPreparation();
      const target = await seedTemplatedBlock({
        base,
        entry: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [typedHeadcount(base, 1, 4)],
        },
      });

      const response = await savePreparation({
        ...target,
        payload: { serves: true },
      });

      expect(response.statusCode).toBe(200);
      const [first, second] = await blockShifts(target.eventTimeBlockId);
      expect(first?.endTime).toEqual(new Date(BLOCK_MIDDLE));
      expect(await shiftRequirements(first?.id ?? '')).toEqual([]);
      expect(await shiftRequirements(second?.id ?? '')).toMatchObject([
        { peopleNeeded: 4 },
      ]);
      expect(response.json()).toMatchObject({ included: true });
    });

    it('falls back to one whole-block Shift with summed counts on a drifted entry', async () => {
      const base = await seedPreparation();
      const target = await seedTemplatedBlock({
        base,
        entry: {
          serves: true,
          shiftSplit: {
            kind: 'manual',
            spans: [
              {
                startTime: parseTimeOfDay({ value: '07:00' }),
                endTime: parseTimeOfDay({ value: '07:30' }),
              },
              {
                startTime: parseTimeOfDay({ value: '07:30' }),
                endTime: parseTimeOfDay({ value: '09:00' }),
              },
            ],
          },
          headcounts: [typedHeadcount(base, 0, 2), typedHeadcount(base, 1, 3)],
        },
      });

      const response = await savePreparation({
        ...target,
        payload: { serves: true },
      });

      expect(response.statusCode).toBe(200);
      const shifts = await blockShifts(target.eventTimeBlockId);
      expect(shifts).toMatchObject([
        { startTime: new Date(BLOCK_START), endTime: new Date(BLOCK_END) },
      ]);
      expect(await shiftRequirements(shifts[0]?.id ?? '')).toMatchObject([
        { peopleNeeded: 5 },
      ]);
    });

    it('creates one flagged whole-block Shift on a one-off block', async () => {
      const base = await seedPreparation();

      const response = await savePreparation({
        ...base,
        payload: { serves: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        included: true,
        shifts: [{ startTime: BLOCK_START, endTime: BLOCK_END, flagged: true }],
      });
      expect(await blockInclusions(base.eventTimeBlockId)).toHaveLength(1);
    });

    it('creates one flagged whole-block Shift when the entry does not serve', async () => {
      const base = await seedPreparation();
      const target = await seedTemplatedBlock({
        base,
        entry: {
          serves: false,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [],
        },
      });

      const response = await savePreparation({
        ...target,
        payload: { serves: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        shifts: [{ flagged: true }],
      });
    });
  });

  describe('validation', () => {
    it('refuses a serving save with no headcounts', async () => {
      const base = await seedPreparation();

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: 'VALIDATION_ERROR',
        reason: 'PREPARATION_EMPTY',
      });
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it('refuses a serving save whose counts are all zero', async () => {
      const base = await seedPreparation();
      const { shift: kept } = await seedBlockShift({ base });

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base, { peopleNeeded: 0 }),
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ reason: 'PREPARATION_EMPTY' });
      expect(await shiftRequirements(kept.id)).toHaveLength(1);
    });

    it('refuses a bare serving save over a served block', async () => {
      const base = await seedPreparation();
      const { shift: kept } = await seedBlockShift({ base });

      const response = await savePreparation({
        ...base,
        payload: { serves: true },
      });

      expect(response.statusCode).toBe(422);
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: kept.id },
      ]);
    });

    it.each([
      ['a negative count', { peopleNeeded: -1 }],
      ['a fractional count', { peopleNeeded: 1.5 }],
      ['a negative Shift index', { shiftIndex: -1 }],
    ])('refuses %s', async (_label, overrides) => {
      const base = await seedPreparation();

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base, overrides),
      });

      expect(response.statusCode).toBe(422);
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it.each([
      ['without serves', { shiftSplit: { kind: 'equal', count: 1 } }],
      [
        'with a zero split count',
        { serves: true, shiftSplit: { kind: 'equal', count: 0 } },
      ],
      [
        'with an unknown split',
        { serves: true, shiftSplit: { kind: 'weekly' } },
      ],
      [
        'with a malformed span',
        {
          serves: true,
          shiftSplit: {
            kind: 'manual',
            spans: [{ startTime: 'soon', endTime: BLOCK_END }],
          },
        },
      ],
    ])('refuses a body %s', async (_label, payload) => {
      const base = await seedPreparation();

      const response = await savePreparation({ ...base, payload });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: 'VALIDATION_ERROR',
        issues: expect.any(Array),
      });
    });

    it('refuses a duplicate (Shift, Sector, Role) pair', async () => {
      const base = await seedPreparation();

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [
            headcountOf(base),
            headcountOf(base, { peopleNeeded: 3 }),
          ],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ reason: 'DUPLICATE_HEADCOUNT' });
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it.each([
      ['a zero then a positive count', [0, 2], 0],
      ['a positive then a zero count', [2, 0], 0],
      ['two zero counts beside another pair', [0, 0], 1],
    ])('refuses a duplicate pair of %s', async (_label, counts, otherShiftCount) => {
      const base = await seedPreparation();
      const repeated = counts.map((peopleNeeded) =>
        headcountOf(base, { peopleNeeded }),
      );
      const other = Array.from({ length: otherShiftCount }, () =>
        headcountOf(base, { shiftIndex: 1 }),
      );

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [...repeated, ...other],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ reason: 'DUPLICATE_HEADCOUNT' });
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it.each([
      ['en', 'Each Sector and Role can appear only once per Shift.'],
      ['pt-BR', 'Cada setor e função pode aparecer só uma vez por turno.'],
    ])('words a duplicate pair without naming Usual setup in %s', async (locale, rule) => {
      const base = await seedPreparation();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/prepare/participations/${base.participationId}/event-time-blocks/${base.eventTimeBlockId}/preparation`,
        cookies: { [testLocale.localeCookieName]: locale },
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [headcountOf(base), headcountOf(base)],
        },
      });

      expect(response.json().message).toContain(rule);
    });

    it('refuses a headcount on a Shift the split does not generate', async () => {
      const base = await seedPreparation();

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base, { shiftIndex: 1 }),
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ reason: 'INVALID_SHIFT_INDEX' });
    });

    it.each([
      ['no spans', []],
      [
        'a span outside the block',
        [{ startTime: BLOCK_START, endTime: '2099-03-01T11:30:00.000Z' }],
      ],
      [
        'a span before the block',
        [{ startTime: '2099-03-01T08:00:00.000Z', endTime: BLOCK_MIDDLE }],
      ],
      [
        'overlapping spans',
        [
          { startTime: BLOCK_START, endTime: BLOCK_END },
          { startTime: BLOCK_MIDDLE, endTime: BLOCK_END },
        ],
      ],
      [
        'spans out of order',
        [
          { startTime: BLOCK_MIDDLE, endTime: BLOCK_END },
          { startTime: BLOCK_START, endTime: BLOCK_MIDDLE },
        ],
      ],
      [
        'a zero-duration span',
        [{ startTime: BLOCK_START, endTime: BLOCK_START }],
      ],
    ])('refuses a manual split with %s as INVALID_SHIFT_SPLIT', async (_label, spans) => {
      const base = await seedPreparation();
      const { shift: kept } = await seedBlockShift({ base });

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'manual', spans },
          headcounts: [headcountOf(base)],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'INVALID_SHIFT_SPLIT' });
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: kept.id },
      ]);
    });
  });

  describe('registry refusals', () => {
    it('refuses an archived Sector or Role and writes nothing', async () => {
      const base = await seedPreparation();
      await db
        .update(sectorTable)
        .set({ archivedAt: new Date() })
        .where(eq(sectorTable.id, base.sectorId));

      const archivedSector = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(archivedSector.statusCode).toBe(404);
      await db
        .update(sectorTable)
        .set({ archivedAt: null })
        .where(eq(sectorTable.id, base.sectorId));
      await db
        .update(roleTable)
        .set({ archivedAt: new Date() })
        .where(eq(roleTable.id, base.roleId));

      const archivedRole = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(archivedRole.statusCode).toBe(404);
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it('refuses a Sector or Role of another Ministry or Church', async () => {
      const base = await seedPreparation();
      const otherMinistry = await buildMinistry({
        db,
        id: randomUUID(),
        churchId: base.churchId,
        name: 'Other ministry',
      });
      const foreignRole = await seedRole({
        churchId: base.churchId,
        ministryId: otherMinistry.id,
        name: 'Usher',
      });
      const otherChurchSector = await buildSector({
        db,
        churchId: base.seed.churchBId,
        ministryId: base.seed.ministryBId,
        name: 'Stage',
      });

      for (const overrides of [
        { roleId: foreignRole.id },
        { sectorId: otherChurchSector.id },
      ]) {
        const response = await savePreparation({
          ...base,
          payload: wholeBlockPayload(base, overrides),
        });

        expect(response.statusCode).toBe(404);
      }
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });
  });

  describe('stage guard', () => {
    it.each([
      'availability_requested',
      'assigning',
    ] as const)('accepts edits in %s', async (state) => {
      const base = await seedPreparation();
      await setParticipationState(base, state);

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(response.statusCode).toBe(200);
      expect(await blockShifts(base.eventTimeBlockId)).toHaveLength(1);
    });

    it('refuses every edit once published', async () => {
      const base = await seedPreparation();
      const { shift: kept } = await seedBlockShift({ base });
      await setParticipationState(base, 'published');

      for (const payload of [
        { serves: false },
        wholeBlockPayload(base, { peopleNeeded: 9 }),
      ]) {
        const response = await savePreparation({ ...base, payload });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: 'ILLEGAL_STATE_TRANSITION',
        });
      }
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: kept.id },
      ]);
    });

    it('refuses a Past Cycle, stored or elapsed', async () => {
      const base = await seedPreparation();
      await db
        .update(cycleTable)
        .set({ state: 'past' })
        .where(eq(cycleTable.id, base.cycle.id));

      const stored = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(stored.statusCode).toBe(409);
      await db
        .update(cycleTable)
        .set({
          state: 'sent',
          startDate: new Date('2020-01-01T00:00:00.000Z'),
          endDate: new Date('2020-01-31T00:00:00.000Z'),
        })
        .where(eq(cycleTable.id, base.cycle.id));

      const elapsed = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(elapsed.statusCode).toBe(409);
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it('refuses a Cycle that was not sent', async () => {
      const base = await seedPreparation();
      await db
        .update(cycleTable)
        .set({ state: 'draft' })
        .where(eq(cycleTable.id, base.cycle.id));

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('gatekeeper', () => {
    interface SeedPersonInput {
      base: Base;
      ministryAccessLevel: 'leader' | 'volunteer';
      ministryId?: string;
    }

    async function seedPerson({
      base,
      ministryAccessLevel,
      ministryId = base.ministryId,
    }: SeedPersonInput) {
      const userId = randomUUID();
      await buildUser({
        db,
        id: userId,
        name: 'Person',
        email: `${userId}@test.com`,
      });
      await buildChurchMembership({
        db,
        churchId: base.churchId,
        userId,
        accessLevel: 'member',
      });
      const volunteer = await buildVolunteer({
        db,
        churchId: base.churchId,
        userId,
      });
      await buildMinistryMembership({
        db,
        churchId: base.churchId,
        ministryId,
        volunteerId: volunteer.id,
        ministryAccessLevel,
        roleIds: [],
        teams: [],
      });
      return userId;
    }

    it('answers 401 when signed out', async () => {
      const base = await seedPreparation();
      mockGetSession.mockResolvedValue(null as never);

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(response.statusCode).toBe(401);
    });

    it('answers 403 to a Volunteer and a plain member', async () => {
      const base = await seedPreparation();
      const volunteerId = await seedPerson({
        base,
        ministryAccessLevel: 'volunteer',
      });
      const memberId = randomUUID();
      await buildUser({
        db,
        id: memberId,
        name: 'Member',
        email: `${memberId}@test.com`,
      });
      await buildChurchMembership({
        db,
        churchId: base.churchId,
        userId: memberId,
        accessLevel: 'member',
      });

      for (const userId of [volunteerId, memberId]) {
        signIn({ userId, churchId: base.churchId });
        const response = await savePreparation({
          ...base,
          payload: wholeBlockPayload(base),
        });

        expect(response.statusCode).toBe(403);
      }
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
    });

    it("answers 404 to a leader of another Ministry and accepts the Ministry's own leader", async () => {
      const base = await seedPreparation();
      const otherMinistry = await buildMinistry({
        db,
        id: randomUUID(),
        churchId: base.churchId,
        name: 'Other ministry',
      });
      const stranger = await seedPerson({
        base,
        ministryAccessLevel: 'leader',
        ministryId: otherMinistry.id,
      });
      const leader = await seedPerson({ base, ministryAccessLevel: 'leader' });

      signIn({ userId: stranger, churchId: base.churchId });
      const refused = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });
      expect(refused.statusCode).toBe(404);

      signIn({ userId: leader, churchId: base.churchId });
      const accepted = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });
      expect(accepted.statusCode).toBe(200);
    });

    it('answers 404 for a missing participation or a block of another Event', async () => {
      const base = await seedPreparation();
      const foreign = await createSchedulingPhase3EventGraph({
        churchId: base.churchId,
        cycleId: base.cycle.id,
        ministryId: base.ministryId,
        title: 'Another Event',
        start: new Date(BLOCK_START),
        end: new Date(BLOCK_END),
        status: 'scheduled',
      });

      const missing = await savePreparation({
        ...base,
        participationId: randomUUID(),
        payload: wholeBlockPayload(base),
      });
      const otherEvent = await savePreparation({
        ...base,
        eventTimeBlockId: foreign.eventTimeBlock.id,
        payload: wholeBlockPayload(base),
      });
      const notAnId = await savePreparation({
        ...base,
        eventTimeBlockId: 'not-a-uuid',
        payload: wholeBlockPayload(base),
      });

      expect(missing.statusCode).toBe(404);
      expect(otherEvent.statusCode).toBe(404);
      expect(notAnId.statusCode).toBe(404);
      expect(await blockShifts(foreign.eventTimeBlock.id)).toEqual([]);
    });

    it('answers 404 for an archived Ministry', async () => {
      const base = await seedPreparation();
      await db
        .update(ministry)
        .set({ deletedAt: new Date() })
        .where(eq(ministry.id, base.ministryId));

      const response = await savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('racing writers', () => {
    const pausedCalls: Array<() => void> = [];

    // A failed barrier must not strand its open transaction under the next test.
    afterEach(() => {
      for (const releaseCall of pausedCalls.splice(0)) releaseCall();
    });

    /** Another transaction of this worker's database is waiting on a row lock. */
    async function waitForLockWaiter() {
      await vi.waitFor(
        async () => {
          const { rows } = await db.execute(sql`
            SELECT count(*)::int AS waiting
            FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
          `);
          expect(rows[0]?.waiting).toBeGreaterThan(0);
        },
        { timeout: LOCK_WAIT_TIMEOUT_MS, interval: LOCK_WAIT_POLL_MS },
      );
    }

    function publish(base: Base) {
      return participationManager.publishCycle({
        churchId: ChurchId.from(base.churchId),
        cycleId: CycleId.from(base.cycle.id),
        ministryId: MinistryId.from(base.ministryId),
        userId: UserId.from(base.adminUserId),
      });
    }

    async function participationState(base: Base) {
      const [row] = await db
        .select({ state: ministryParticipation.state })
        .from(ministryParticipation)
        .where(eq(ministryParticipation.id, base.participationId));
      return row?.state;
    }

    /** Pauses the first call of a repository write inside its transaction until the test releases it. */
    function pauseCall<Repository extends object>(
      prototype: Repository,
      method: keyof Repository,
    ) {
      const original = prototype[method] as (input: never) => Promise<unknown>;
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached = () => {};
      const paused = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let isFirstCall = true;
      const pausedWrite = async function (this: Repository, input: never) {
        if (isFirstCall) {
          isFirstCall = false;
          reached();
          await released;
        }
        return original.call(this, input);
      };
      const spy = vi
        .spyOn(prototype, method as never)
        .mockImplementation(pausedWrite as never);
      pausedCalls.push(() => {
        release();
        spy.mockRestore();
      });
      return { paused, release };
    }

    function pauseWrite(method: 'touch' | 'updateState') {
      return pauseCall(
        DrizzleMinistryParticipationRepository.prototype,
        method,
      );
    }

    /** The save is mid-transaction, holding its lock, while Publish starts and blocks. */
    async function saveAheadOfPublish(
      base: Base,
      payload: Record<string, unknown>,
    ) {
      const { paused, release } = pauseWrite('touch');
      const saving = savePreparation({ ...base, payload });
      await paused;
      const publishing = publish(base);
      await waitForLockWaiter();
      release();
      const [saved, published] = await Promise.all([saving, publishing]);
      return { saved, published };
    }

    it('makes Publish see a clean opt-in it overlapped and ask for confirmation', async () => {
      const base = await seedPreparation();
      await setParticipationState(base, 'availability_requested');

      const { saved, published } = await saveAheadOfPublish(
        base,
        wholeBlockPayload(base, { peopleNeeded: 3 }),
      );

      expect(saved.statusCode).toBe(200);
      expect(published).toMatchObject({ published: false, belowFull: true });
      expect(await participationState(base)).toBe('availability_requested');
    });

    it('makes Publish see a headcount increase it overlapped on a full Schedule', async () => {
      const base = await seedPreparation();
      const { shift: staffed, requirement } = await seedBlockShift({
        base,
        peopleNeeded: 1,
      });
      const { volunteer } = await seedVolunteerMembership({
        churchId: base.churchId,
        ministryId: base.ministryId,
        name: 'Assigned',
        email: `assigned-${randomUUID()}@test.com`,
      });
      await buildAssignment({
        db,
        churchId: base.churchId,
        participationId: base.participationId,
        shiftId: staffed.id,
        volunteerId: volunteer.id,
        roleId: base.roleId,
        shiftRequirementId: requirement.id,
        status: 'confirmed',
      });
      await setParticipationState(base, 'assigning');

      const { saved, published } = await saveAheadOfPublish(
        base,
        wholeBlockPayload(base, { peopleNeeded: 2 }),
      );

      expect(saved.statusCode).toBe(200);
      expect(published).toMatchObject({ published: false, belowFull: true });
      expect(await participationState(base)).toBe('assigning');
    });

    it('refuses a save that waited on a Publish, leaving the published graph alone', async () => {
      const base = await seedPreparation();
      await setParticipationState(base, 'availability_requested');
      const { paused, release } = pauseWrite('updateState');

      const publishing = publish(base);
      await paused;
      const saving = savePreparation({
        ...base,
        payload: wholeBlockPayload(base),
      });
      await waitForLockWaiter();
      release();
      const [published, saved] = await Promise.all([publishing, saving]);

      expect(published).toMatchObject({ published: true, belowFull: false });
      expect(saved.statusCode).toBe(409);
      expect(saved.json()).toMatchObject({ error: 'ILLEGAL_STATE_TRANSITION' });
      expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
      expect(await participationState(base)).toBe('published');
    });

    interface SeedAssignableInput {
      base: Base;
      state: 'preparing' | 'availability_requested' | 'assigning';
    }

    /** A requirement a Volunteer can be assigned to, on a Schedule in `state`. */
    async function seedAssignable({ base, state }: SeedAssignableInput) {
      const { shift: seeded, requirement } = await seedBlockShift({
        base,
        peopleNeeded: 1,
      });
      const { volunteer } = await seedVolunteerMembership({
        churchId: base.churchId,
        ministryId: base.ministryId,
        name: 'Racing Volunteer',
        email: `racing-${randomUUID()}@test.com`,
      });
      await db
        .update(ministryParticipation)
        .set({ state })
        .where(eq(ministryParticipation.id, base.participationId));
      return { shift: seeded, requirement, volunteer };
    }

    type Assignable = Awaited<ReturnType<typeof seedAssignable>>;

    function assign(base: Base, target: Assignable) {
      return assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(base.churchId),
        shiftId: ShiftId.from(target.shift.id),
        volunteerId: VolunteerId.from(target.volunteer.id),
        actorId: UserId.from(base.adminUserId),
        shiftRequirementId: ShiftRequirementId.from({
          raw: target.requirement.id,
        }),
      });
    }

    function assignmentsOf(base: Base) {
      return db
        .select()
        .from(assignment)
        .where(eq(assignment.participationId, base.participationId));
    }

    function pauseAssignmentInsert() {
      return pauseCall(DrizzleAssignmentRepository.prototype, 'create');
    }

    /** The assignment has inserted and is about to move the state when a save overlaps it. */
    async function assignAheadOfSave(
      base: Base,
      target: Assignable,
      payload: Record<string, unknown>,
    ) {
      const { paused, release } = pauseWrite('updateState');
      const assigning = assign(base, target);
      await paused;
      const saving = savePreparation({ ...base, payload });
      await waitForLockWaiterOr(saving);
      release();
      const [assigned, saved] = await Promise.allSettled([assigning, saving]);
      return { assigned, saved };
    }

    /** Waits for the overlap, or for the rival to finish without ever blocking. */
    async function waitForLockWaiterOr(rival: Promise<unknown>) {
      await Promise.race([waitForLockWaiter(), rival.catch(() => {})]);
    }

    function statusOf(saved: PromiseSettledResult<{ statusCode: number }>) {
      return saved.status === 'fulfilled' ? saved.value.statusCode : 'rejected';
    }

    it('commits an Assignment a same-spans save overlapped, with no deadlock', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });

      const { assigned, saved } = await assignAheadOfSave(
        base,
        target,
        wholeBlockPayload(base, { peopleNeeded: 3 }),
      );

      expect(assigned).toMatchObject({ status: 'fulfilled' });
      expect(statusOf(saved)).toBe(200);
      expect(await assignmentsOf(base)).toHaveLength(1);
      expect(await participationState(base)).toBe('assigning');
    });

    it('commits an Assignment a re-split overlapped, with no deadlock', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });

      const { assigned, saved } = await assignAheadOfSave(base, target, {
        serves: true,
        shiftSplit: { kind: 'equal', count: 2 },
        headcounts: [headcountOf(base)],
      });

      expect(assigned).toMatchObject({ status: 'fulfilled' });
      // Refused once the response guards land; either way, never a deadlock's 500.
      expect(statusOf(saved)).not.toBe(500);
      expect(statusOf(saved)).not.toBe('rejected');
      expect(await participationState(base)).toBe('assigning');
    });

    it('commits an Assignment an opt-out overlapped, with no deadlock', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });

      const { assigned, saved } = await assignAheadOfSave(base, target, {
        serves: false,
      });

      expect(assigned).toMatchObject({ status: 'fulfilled' });
      expect(statusOf(saved)).not.toBe(500);
      expect(statusOf(saved)).not.toBe('rejected');
      expect(await participationState(base)).toBe('assigning');
    });

    it('answers not found to an Assignment whose Shift a save it waited on replaced', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });
      const { paused, release } = pauseWrite('touch');

      const saving = savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [headcountOf(base)],
        },
      });
      await paused;
      const assigning = assign(base, target);
      await waitForLockWaiter();
      release();
      const [saved, assigned] = await Promise.allSettled([saving, assigning]);

      expect(statusOf(saved)).toBe(200);
      expect(assigned.status).toBe('rejected');
      expect((assigned as PromiseRejectedResult).reason).toBeInstanceOf(
        NotFoundError,
      );
      expect(await assignmentsOf(base)).toEqual([]);
      expect(await participationState(base)).toBe('availability_requested');
    });

    it('keeps a Schedule published when an Assignment waited on the Publish', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });
      const { paused, release } = pauseWrite('updateState');

      const publishing = participationManager.publishCycle({
        churchId: ChurchId.from(base.churchId),
        cycleId: CycleId.from(base.cycle.id),
        ministryId: MinistryId.from(base.ministryId),
        userId: UserId.from(base.adminUserId),
        confirmBelowFull: true,
      });
      await paused;
      const assigning = assign(base, target);
      await waitForLockWaiter();
      release();
      const [published, assigned] = await Promise.allSettled([
        publishing,
        assigning,
      ]);

      expect(published).toMatchObject({ status: 'fulfilled' });
      expect(assigned).toMatchObject({ status: 'fulfilled' });
      expect(await participationState(base)).toBe('published');
    });

    it('publishes after an Assignment it overlapped, staying published', async () => {
      const base = await seedPreparation();
      const target = await seedAssignable({
        base,
        state: 'availability_requested',
      });
      const { paused, release } = pauseAssignmentInsert();

      const assigning = assign(base, target);
      await paused;
      const publishing = participationManager.publishCycle({
        churchId: ChurchId.from(base.churchId),
        cycleId: CycleId.from(base.cycle.id),
        ministryId: MinistryId.from(base.ministryId),
        userId: UserId.from(base.adminUserId),
        confirmBelowFull: true,
      });
      await waitForLockWaiterOr(publishing);
      release();
      const [assigned, published] = await Promise.allSettled([
        assigning,
        publishing,
      ]);

      expect(assigned).toMatchObject({ status: 'fulfilled' });
      expect(published).toMatchObject({ status: 'fulfilled' });
      expect(await participationState(base)).toBe('published');
    });
  });

  describe('atomicity', () => {
    it('rolls the whole graph back when a write fails midway', async () => {
      const base = await seedPreparation();
      const { shift: previous, requirement } = await seedBlockShift({ base });
      const failure = vi
        .spyOn(DrizzleShiftRepository.prototype, 'saveRequirement')
        .mockRejectedValueOnce(new Error('injected write failure'));

      const response = await savePreparation({
        ...base,
        payload: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [headcountOf(base)],
        },
      });
      failure.mockRestore();

      expect(response.statusCode).toBe(500);
      expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
        { id: previous.id },
      ]);
      expect(await shiftRequirements(previous.id)).toMatchObject([
        { id: requirement.id, peopleNeeded: 2 },
      ]);
    });

    it('rolls an opt-in back when a seeding write fails', async () => {
      const base = await seedPreparation();
      const failure = vi
        .spyOn(DrizzleShiftRepository.prototype, 'createMany')
        .mockRejectedValueOnce(new Error('injected write failure'));

      const response = await savePreparation({
        ...base,
        payload: { serves: true },
      });
      failure.mockRestore();

      expect(response.statusCode).toBe(500);
      expect(await blockInclusions(base.eventTimeBlockId)).toEqual([]);
    });
  });

  describe('flow-6 response guards', () => {
    function manualPayload(base: Base, spans: [string, string][]) {
      return {
        serves: true,
        shiftSplit: {
          kind: 'manual',
          spans: spans.map(([startTime, endTime]) => ({ startTime, endTime })),
        },
        headcounts: spans.map((_, shiftIndex) =>
          headcountOf(base, { shiftIndex }),
        ),
      };
    }

    async function seedVolunteerOf(base: Base) {
      const id = randomUUID();
      return seedVolunteerMembership({
        churchId: base.churchId,
        ministryId: base.ministryId,
        name: `Volunteer ${id}`,
        email: `${id}@test.com`,
      });
    }

    async function seedCheck(base: Base) {
      const { membership } = await seedVolunteerOf(base);
      return buildAvailabilityCheck({
        db,
        churchId: base.churchId,
        cycleId: base.cycle.id,
        ministryMembershipId: membership.id,
      });
    }

    /** One Volunteer's answer that they cannot serve the Shift. */
    async function markShift(base: Base, shiftId: string) {
      const check = await seedCheck(base);
      await buildUnavailableShift({
        db,
        churchId: base.churchId,
        availabilityCheckId: check.id,
        shiftId,
      });
    }

    interface SeedAssignedInput {
      base: Base;
      shiftId: string;
      shiftRequirementId: string;
      status?: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
    }

    async function assign({
      base,
      shiftId,
      shiftRequirementId,
      status = 'pending',
    }: SeedAssignedInput) {
      const { volunteer } = await seedVolunteerOf(base);
      await buildAssignment({
        db,
        churchId: base.churchId,
        participationId: base.participationId,
        shiftId,
        volunteerId: volunteer.id,
        roleId: base.roleId,
        shiftRequirementId,
        status,
      });
    }

    function marksOf(shiftId: string) {
      return db
        .select()
        .from(unavailableShift)
        .where(eq(unavailableShift.shiftId, shiftId));
    }

    function assignmentsOf(shiftId: string) {
      return db
        .select()
        .from(assignment)
        .where(eq(assignment.shiftId, shiftId));
    }

    /** Two halves of the block, the first answered for unless a test says otherwise. */
    async function seedHalves(base: Base) {
      const first = await seedBlockShift({ base, endTime: BLOCK_MIDDLE });
      const secondShift = await seedShift({
        churchId: base.churchId,
        participationId: base.participationId,
        eventTimeBlockId: base.eventTimeBlockId,
        startTime: new Date(BLOCK_MIDDLE),
        endTime: new Date(BLOCK_END),
        label: 'Second half',
      });
      await seedRequirement({
        churchId: base.churchId,
        participationId: base.participationId,
        shiftId: secondShift.id,
        roleId: base.roleId,
        sectorId: base.sectorId,
        peopleNeeded: 2,
      });
      return { first: first.shift, second: secondShift };
    }

    const ANSWER_RACE_WINDOW_MS = 300;
    const SPLIT_SECOND_HALF: [string, string][] = [
      [BLOCK_START, BLOCK_MIDDLE],
      [BLOCK_MIDDLE, '2099-03-01T10:30:00.000Z'],
      ['2099-03-01T10:30:00.000Z', BLOCK_END],
    ];
    const FIRST_HALF: [string, string][] = [[BLOCK_START, BLOCK_MIDDLE]];
    const SECOND_HALF: [string, string][] = [[BLOCK_MIDDLE, BLOCK_END]];
    const BOTH_HALVES: [string, string][] = [...FIRST_HALF, ...SECOND_HALF];

    describe('headcounts', () => {
      it.each([
        'availability_requested',
        'assigning',
      ] as const)('moves freely in %s until the assigned floor, then refuses naming the count', async (state) => {
        const base = await seedPreparation();
        const { shift: kept, requirement } = await seedBlockShift({
          base,
          peopleNeeded: 3,
        });
        await markShift(base, kept.id);
        const assigned = {
          base,
          shiftId: kept.id,
          shiftRequirementId: requirement.id,
        };
        await assign(assigned);
        await assign({ ...assigned, status: 'confirmed' });
        await setParticipationState(base, state);

        for (const peopleNeeded of [5, 2]) {
          const free = await savePreparation({
            ...base,
            payload: wholeBlockPayload(base, { peopleNeeded }),
          });

          expect(free.statusCode).toBe(200);
          expect(await shiftRequirements(kept.id)).toMatchObject([
            { id: requirement.id, peopleNeeded },
          ]);
        }

        const refused = await savePreparation({
          ...base,
          payload: wholeBlockPayload(base, { peopleNeeded: 1 }),
        });

        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({
          error: 'HEADCOUNT_BELOW_ASSIGNED',
          headcountFloors: [
            {
              shiftId: kept.id,
              sectorId: base.sectorId,
              roleId: base.roleId,
              assignedCount: 2,
            },
          ],
        });
        expect(refused.json().message).toContain('2');
        expect(await shiftRequirements(kept.id)).toMatchObject([
          { peopleNeeded: 2 },
        ]);
      });

      it('refuses removing an assigned requirement, by zero or by omission', async () => {
        const base = await seedPreparation();
        const { first } = await seedHalves(base);
        const [requirement] = await shiftRequirements(first.id);
        await assign({
          base,
          shiftId: first.id,
          shiftRequirementId: requirement?.id ?? '',
        });
        const keepSecond = headcountOf(base, { shiftIndex: 1 });
        const split = {
          kind: 'manual',
          spans: BOTH_HALVES.map(([startTime, endTime]) => ({
            startTime,
            endTime,
          })),
        };

        for (const headcounts of [
          [keepSecond],
          [headcountOf(base, { shiftIndex: 0, peopleNeeded: 0 }), keepSecond],
          [headcountOf(base, { shiftIndex: 0, peopleNeeded: 0 })],
        ]) {
          const response = await savePreparation({
            ...base,
            payload: { serves: true, shiftSplit: split, headcounts },
          });

          expect(response.statusCode).toBe(409);
          expect(response.json()).toMatchObject({
            error: 'HEADCOUNT_BELOW_ASSIGNED',
            headcountFloors: [{ shiftId: first.id, assignedCount: 1 }],
          });
        }
        expect(await shiftRequirements(first.id)).toHaveLength(1);
        expect(await assignmentsOf(first.id)).toHaveLength(1);
      });

      it('names the count in the request locale', async () => {
        const base = await seedPreparation();
        const { shift: kept, requirement } = await seedBlockShift({ base });
        await assign({
          base,
          shiftId: kept.id,
          shiftRequirementId: requirement.id,
        });

        const refused = await app.inject({
          method: 'PUT',
          url: `/api/v1/prepare/participations/${base.participationId}/event-time-blocks/${base.eventTimeBlockId}/preparation`,
          headers: { cookie: `${testLocale.localeCookieName}=pt-BR` },
          payload: wholeBlockPayload(base, { peopleNeeded: 0 }),
        });

        expect(refused.statusCode).toBe(409);
        expect(refused.json().message).toBe(
          m.error_headcount_below_assigned_count(
            { count: 1 },
            { locale: 'pt-BR' },
          ),
        );
        expect(refused.json().message).toContain('Já escalados: 1');
      });
    });

    describe('Shifts with responses', () => {
      it.each([
        ['splitting its neighbor', SPLIT_SECOND_HALF],
        ['adding beside it', BOTH_HALVES],
      ])('refuses a re-split %s over a marked Shift that keeps its identity', async (_shape, spans) => {
        const base = await seedPreparation();
        const { shift: marked } = await seedBlockShift({
          base,
          endTime: BLOCK_MIDDLE,
        });
        await markShift(base, marked.id);
        await markShift(base, marked.id);
        await setParticipationState(base, 'availability_requested');

        const response = await savePreparation({
          ...base,
          payload: manualPayload(base, spans),
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: 'SHIFT_HAS_RESPONSES',
          shiftResponses: [
            {
              shiftId: marked.id,
              unavailableMarkCount: 2,
              assignmentCount: 0,
            },
          ],
        });
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: marked.id },
        ]);
        expect(await marksOf(marked.id)).toHaveLength(2);
      });

      it('refuses a re-split over an assigned Shift and reports every affected Shift', async () => {
        const base = await seedPreparation();
        const { first, second } = await seedHalves(base);
        const [requirement] = await shiftRequirements(second.id);
        await assign({
          base,
          shiftId: second.id,
          shiftRequirementId: requirement?.id ?? '',
        });
        await markShift(base, first.id);

        const response = await savePreparation({
          ...base,
          payload: wholeBlockPayload(base),
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().shiftResponses).toEqual([
          { shiftId: first.id, unavailableMarkCount: 1, assignmentCount: 0 },
          { shiftId: second.id, unavailableMarkCount: 0, assignmentCount: 1 },
        ]);
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: first.id },
          { id: second.id },
        ]);
      });

      it('refuses deleting a marked Shift but deletes its clean neighbor, keeping the answers', async () => {
        const base = await seedPreparation();
        const { first } = await seedHalves(base);
        await markShift(base, first.id);

        const refused = await savePreparation({
          ...base,
          payload: manualPayload(base, SECOND_HALF),
        });

        expect(refused.statusCode).toBe(409);
        expect(refused.json().shiftResponses).toEqual([
          { shiftId: first.id, unavailableMarkCount: 1, assignmentCount: 0 },
        ]);
        expect(await blockShifts(base.eventTimeBlockId)).toHaveLength(2);

        const deleted = await savePreparation({
          ...base,
          payload: manualPayload(base, FIRST_HALF),
        });

        expect(deleted.statusCode).toBe(200);
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: first.id },
        ]);
        expect(await marksOf(first.id)).toHaveLength(1);
      });

      it('refuses opting out with per-Shift counts and writes nothing', async () => {
        const base = await seedPreparation();
        const { first, second } = await seedHalves(base);
        const [requirement] = await shiftRequirements(first.id);
        await markShift(base, first.id);
        await assign({
          base,
          shiftId: first.id,
          shiftRequirementId: requirement?.id ?? '',
        });

        const response = await savePreparation({
          ...base,
          payload: { serves: false },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: 'SHIFT_HAS_RESPONSES',
          shiftResponses: [
            { shiftId: first.id, unavailableMarkCount: 1, assignmentCount: 1 },
          ],
        });
        expect(response.json().shiftResponses).toHaveLength(1);
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: first.id },
          { id: second.id },
        ]);
        expect(await blockInclusions(base.eventTimeBlockId)).toHaveLength(1);
        expect(await assignmentsOf(first.id)).toHaveLength(1);
      });

      it('keeps a marked Shift when only its label or headcount changes', async () => {
        const base = await seedPreparation();
        const { shift: marked, requirement } = await seedBlockShift({ base });
        await markShift(base, marked.id);

        const response = await savePreparation({
          ...base,
          payload: {
            serves: true,
            shiftSplit: {
              kind: 'manual',
              spans: [
                {
                  startTime: BLOCK_START,
                  endTime: BLOCK_END,
                  label: 'Renamed',
                },
              ],
            },
            headcounts: [headcountOf(base, { peopleNeeded: 7 })],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: marked.id, label: 'Renamed' },
        ]);
        expect(await shiftRequirements(marked.id)).toMatchObject([
          { id: requirement.id, peopleNeeded: 7 },
        ]);
        expect(await marksOf(marked.id)).toHaveLength(1);
      });

      it('reads a racing answer before deciding, so it is never discarded', async () => {
        const base = await seedPreparation();
        const { shift: answered } = await seedBlockShift({ base });
        const check = await seedCheck(base);
        let save: ReturnType<typeof savePreparation> | undefined;

        await db.transaction(async (tx) => {
          await tx.insert(unavailableShift).values({
            churchId: base.churchId,
            availabilityCheckId: check.id,
            shiftId: answered.id,
          });
          save = savePreparation({ ...base, payload: { serves: false } });
          // The save must reach the Shift rows while this answer is uncommitted.
          await new Promise((resolve) =>
            setTimeout(resolve, ANSWER_RACE_WINDOW_MS),
          );
        });
        const outcome = await save;

        expect(outcome?.statusCode).toBe(409);
        expect(await marksOf(answered.id)).toHaveLength(1);
      });
    });

    describe('free edits', () => {
      it('re-splits, deletes and opts out clean Shifts silently', async () => {
        const base = await seedPreparation();
        const { first, second } = await seedHalves(base);
        await setParticipationState(base, 'availability_requested');

        const resplit = await savePreparation({
          ...base,
          payload: manualPayload(base, SPLIT_SECOND_HALF),
        });

        expect(resplit.statusCode).toBe(200);
        const resplitShifts = await blockShifts(base.eventTimeBlockId);
        expect(resplitShifts).toHaveLength(3);
        expect(resplitShifts.map(({ id }) => id)).not.toContain(second.id);

        const deleted = await savePreparation({
          ...base,
          payload: manualPayload(base, FIRST_HALF),
        });

        expect(deleted.statusCode).toBe(200);
        expect(await blockShifts(base.eventTimeBlockId)).toMatchObject([
          { id: first.id },
        ]);

        const optedOut = await savePreparation({
          ...base,
          payload: { serves: false },
        });

        expect(optedOut.statusCode).toBe(200);
        expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
      });

      it('adds a Shift beside a clean one, keeping its id', async () => {
        const base = await seedPreparation();
        const { shift: clean, requirement } = await seedBlockShift({
          base,
          startTime: BLOCK_MIDDLE,
        });
        await setParticipationState(base, 'assigning');

        const response = await savePreparation({
          ...base,
          payload: {
            serves: true,
            shiftSplit: {
              kind: 'manual',
              spans: BOTH_HALVES.map(([startTime, endTime]) => ({
                startTime,
                endTime,
              })),
            },
            headcounts: [headcountOf(base, { shiftIndex: 1 })],
          },
        });

        expect(response.statusCode).toBe(200);
        const [added, kept] = await blockShifts(base.eventTimeBlockId);
        expect(added?.id).not.toBe(clean.id);
        expect(kept?.id).toBe(clean.id);
        expect(await shiftRequirements(clean.id)).toMatchObject([
          { id: requirement.id },
        ]);
      });

      it('opts a skipped block in after asking and the read says earlier answers do not cover it', async () => {
        const base = await seedPreparation();
        const { shift: answered } = await seedBlockShift({ base });
        await markShift(base, answered.id);
        await setParticipationState(base, 'availability_requested');
        const skipped = await seedSecondBlock(base);

        const response = await savePreparation({
          ...base,
          eventTimeBlockId: skipped.id,
          payload: { serves: true },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          included: true,
          shiftsChangedAfterAsk: true,
          shifts: [{ flagged: true }],
        });
        const read = await app.inject({
          method: 'GET',
          url: `/api/v1/prepare/cycles/${base.cycle.id}/participation?ministryId=${base.ministryId}`,
        });
        expect(read.statusCode).toBe(200);
        const blocks = read
          .json()
          .events.flatMap(
            (event: { eventTimeBlocks: BlockSignal[] }) =>
              event.eventTimeBlocks,
          );
        const signal = ({ eventTimeBlock: block }: BlockSignal) =>
          block.id === skipped.id;
        expect(blocks.find(signal)?.shiftsChangedAfterAsk).toBe(true);
        expect(
          blocks.find((candidate: BlockSignal) => !signal(candidate))
            ?.shiftsChangedAfterAsk,
        ).toBe(false);
      });
    });

    describe('cancelled and declined Assignments', () => {
      it.each([
        'cancelled',
        'declined',
      ] as const)('%s never blocks a lower headcount, a re-split or an opt-out', async (status) => {
        const base = await seedPreparation();
        const { shift: seeded, requirement } = await seedBlockShift({ base });
        await assign({
          base,
          shiftId: seeded.id,
          shiftRequirementId: requirement.id,
          status,
        });

        const removed = await savePreparation({
          ...base,
          payload: wholeBlockPayload(base, {
            peopleNeeded: 1,
            roleId: (await seedRole({ ...base, name: 'Helper' })).id,
          }),
        });

        expect(removed.statusCode).toBe(200);
        expect(await shiftRequirements(seeded.id)).toMatchObject([
          { peopleNeeded: 1 },
        ]);

        const resplit = await savePreparation({
          ...base,
          payload: manualPayload(base, BOTH_HALVES),
        });

        expect(resplit.statusCode).toBe(200);

        const optedOut = await savePreparation({
          ...base,
          payload: { serves: false },
        });

        expect(optedOut.statusCode).toBe(200);
        expect(await blockShifts(base.eventTimeBlockId)).toEqual([]);
      });
    });
  });
});

describe('GET /prepare/cycles/:cycleId/participation', () => {
  it('returns 404 to a ChurchAdmin for an archived Ministry with existing Past-Cycle preparation', async () => {
    const base = await seedPreparation();
    const pastStart = new Date('2020-03-01T09:00:00.000Z');
    const pastEnd = new Date('2020-03-01T11:00:00.000Z');
    await db
      .update(eventTable)
      .set({ start: pastStart, end: pastEnd })
      .where(eq(eventTable.id, base.eventId));
    await db
      .update(eventTimeBlock)
      .set({ startTime: pastStart, endTime: pastEnd })
      .where(eq(eventTimeBlock.id, base.eventTimeBlockId));
    await seedBlockShift({
      base,
      startTime: '2020-03-01T09:00:00.000Z',
      endTime: '2020-03-01T11:00:00.000Z',
    });
    await db
      .update(cycleTable)
      .set({
        state: 'past',
        startDate: new Date('2020-03-01T00:00:00.000Z'),
        endDate: new Date('2020-03-31T00:00:00.000Z'),
      })
      .where(eq(cycleTable.id, base.cycle.id));
    const url = `/api/v1/prepare/cycles/${base.cycle.id}/participation?ministryId=${base.ministryId}`;
    const active = await app.inject({ method: 'GET', url });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({
      events: [
        {
          participation: { id: base.participationId },
          eventTimeBlocks: [
            {
              included: true,
              shifts: [{ requirements: [{ peopleNeeded: 2 }] }],
            },
          ],
        },
      ],
    });
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, base.ministryId));

    const archived = await app.inject({ method: 'GET', url });

    expect(archived.statusCode).toBe(404);
    expect(archived.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
