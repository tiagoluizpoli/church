import { randomUUID } from 'node:crypto';
import {
  ministry,
  role,
  sector,
  templateTimeBlock,
  usualSetup,
} from '@church/db';
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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { UsualSetupController } from '@/api/controllers/usual-setup-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  const db = schedulingTestDb;
  const ministryRepo = new DrizzleMinistryRepository({ db });
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories and AuthorityService; only the session and
  // Active Church selection are seams.
  const authorityGuard = new AuthorityGuard({
    manager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: {} as never,
      eventRepository: {} as never,
      eventTimeBlockRepository: {} as never,
      ministryRepository: ministryRepo,
    }),
  });
  const controller = new UsualSetupController({
    ministryManager: new DbMinistryManager({
      ministryRepo,
      volunteerRepo: new DrizzleVolunteerRepository({ db }),
      invitationRepo: {} as never,
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    participationManager: createSchedulingManagers().participationManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard,
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

const CHURCH_A = '81111111-1111-4111-8111-111111111111';
const CHURCH_B = '82222222-2222-4222-8222-222222222222';
const PT_BR = { locale: 'pt-BR' as const };

/** `leader` leads only Worship; `otherLeader` leads only Kids; `admin` has no Volunteer profile. */
type Persona = 'admin' | 'leader' | 'otherLeader' | 'volunteer' | 'member';

interface PersonaRecord {
  userId: string;
  volunteerId: string | null;
}

interface Fixture {
  personas: Record<Persona, PersonaRecord>;
  worshipId: string;
  kidsId: string;
  archivedMinistryId: string;
  foreignMinistryId: string;
  /** Sunday: Welcome (order 0) then Service (order 1); Saturday: Vigil. */
  welcomeId: string;
  serviceId: string;
  vigilId: string;
  foreignBlockId: string;
  stageId: string;
  doorId: string;
  archivedSectorId: string;
  kidsRoomId: string;
  singerId: string;
  archivedRoleId: string;
  kidsRoleId: string;
}

interface BuildPersonaInput {
  key: Persona;
  churchAccess: 'admin' | 'member';
  membership?: { ministryId: string; level: 'leader' | 'volunteer' };
}

async function buildPersona({
  key,
  churchAccess,
  membership,
}: BuildPersonaInput): Promise<PersonaRecord> {
  const db = schedulingTestDb;
  const userId = `usual-setup-${key}`;
  await buildUser({ db, id: userId, name: key, email: `us-${key}@test.com` });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId,
    accessLevel: churchAccess,
  });
  if (!membership) return { userId, volunteerId: null };
  const volunteer = await buildVolunteer({ db, churchId: CHURCH_A, userId });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: volunteer.id,
    ministryId: membership.ministryId,
    ministryAccessLevel: membership.level,
    roleIds: [],
  });
  return { userId, volunteerId: volunteer.id };
}

const NINE = parseTimeOfDay({ value: '09:00' });
const TEN = parseTimeOfDay({ value: '10:00' });
const NOON = parseTimeOfDay({ value: '12:00' });

async function seed(): Promise<Fixture> {
  const db = schedulingTestDb;
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'us-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'us-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const archived = await buildMinistry({ db, churchId: CHURCH_A, name: 'Old' });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archived.id));
  const foreign = await buildMinistry({ db, churchId: CHURCH_B, name: 'Far' });
  // Saturday's template sorts after Sunday's by name ("Vigil" > "Sunday").
  const vigil = await buildEventTemplate({
    db,
    churchId: CHURCH_A,
    name: 'Vigil',
    weekday: 6,
    blocks: [{ label: 'Night', startTime: NINE, endTime: TEN }],
  });
  const sunday = await buildEventTemplate({
    db,
    churchId: CHURCH_A,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      { label: 'Service', startTime: TEN, endTime: NOON, order: 1 },
      { label: 'Welcome', startTime: NINE, endTime: TEN, order: 0 },
    ],
  });
  const foreignTemplate = await buildEventTemplate({
    db,
    churchId: CHURCH_B,
    name: 'Far Sunday',
    weekday: 0,
    blocks: [{ label: 'Morning', startTime: NINE, endTime: TEN }],
  });
  const blockId = (label: string) => {
    const block = sunday.blocks.find((candidate) => candidate.label === label);
    if (!block) throw new Error(`missing block ${label}`);
    return block.id;
  };
  const child = { db, churchId: CHURCH_A, ministryId: worship.id };
  const stage = await buildSector({ ...child, name: 'Stage' });
  const door = await buildSector({ ...child, name: 'Door' });
  const archivedSector = await buildSector({ ...child, name: 'Old Door' });
  await db
    .update(sector)
    .set({ archivedAt: new Date() })
    .where(eq(sector.id, archivedSector.id));
  const kidsRoom = await buildSector({
    db,
    churchId: CHURCH_A,
    ministryId: kids.id,
    name: 'Kids Room',
  });
  const singer = await buildRole({ ...child, name: 'Singer' });
  const archivedRole = await buildRole({ ...child, name: 'Retired' });
  await db
    .update(role)
    .set({ archivedAt: new Date() })
    .where(eq(role.id, archivedRole.id));
  const kidsRole = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: kids.id,
    name: 'Teacher',
  });
  const [vigilBlock] = vigil.blocks;
  const [foreignBlock] = foreignTemplate.blocks;
  if (!vigilBlock || !foreignBlock) throw new Error('block seed failed');
  return {
    worshipId: worship.id,
    kidsId: kids.id,
    archivedMinistryId: archived.id,
    foreignMinistryId: foreign.id,
    welcomeId: blockId('Welcome'),
    serviceId: blockId('Service'),
    vigilId: vigilBlock.id,
    foreignBlockId: foreignBlock.id,
    stageId: stage.id,
    doorId: door.id,
    archivedSectorId: archivedSector.id,
    kidsRoomId: kidsRoom.id,
    singerId: singer.id,
    archivedRoleId: archivedRole.id,
    kidsRoleId: kidsRole.id,
    personas: {
      admin: await buildPersona({ key: 'admin', churchAccess: 'admin' }),
      leader: await buildPersona({
        key: 'leader',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'leader' },
      }),
      otherLeader: await buildPersona({
        key: 'otherLeader',
        churchAccess: 'member',
        membership: { ministryId: kids.id, level: 'leader' },
      }),
      volunteer: await buildPersona({
        key: 'volunteer',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'volunteer' },
      }),
      member: await buildPersona({ key: 'member', churchAccess: 'member' }),
    },
  };
}

let fixture: Fixture;

beforeEach(async () => {
  fixture = await seed();
});

function signIn(persona: Persona) {
  const { userId, volunteerId } = fixture.personas[persona];
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId,
    autoSelected: false,
  });
}

function list(ministryId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/ministries/${ministryId}/usual-setup`,
  });
}

function save(ministryId: string, blockId: string, payload: unknown) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/ministries/${ministryId}/usual-setup/${blockId}`,
    payload: payload as never,
  });
}

function stored() {
  return schedulingTestDb
    .select()
    .from(usualSetup)
    .orderBy(usualSetup.sourceTemplateTimeBlockId);
}

function wholeBlock(headcounts: unknown[]) {
  return { serves: true, shiftSplit: { kind: 'equal', count: 1 }, headcounts };
}

function singerAt(sectorId: string, peopleNeeded = 1, shiftIndex = 0) {
  return { shiftIndex, sectorId, roleId: fixture.singerId, peopleNeeded };
}

describe('GET /ministries/:ministryId/usual-setup', () => {
  it('lists every current block by template name then block order, new blocks without an entry', async () => {
    signIn('admin');

    const res = await list(fixture.worshipId);

    expect(res.statusCode).toBe(200);
    expect(
      res.json().blocks.map((block: { label: string }) => block.label),
    ).toEqual(['Welcome', 'Service', 'Night']);
    expect(res.json().blocks[0]).toEqual({
      templateId: expect.any(String),
      templateName: 'Sunday',
      weekday: 0,
      sourceTemplateTimeBlockId: fixture.welcomeId,
      label: 'Welcome',
      startTime: '09:00',
      endTime: '10:00',
      order: 0,
      needsReview: false,
    });
  });

  it('keeps an existing multi-Shift entry as stored', async () => {
    const twoShifts = {
      serves: true,
      shiftSplit: { kind: 'equal' as const, count: 2 },
      headcounts: [
        singerAt(fixture.stageId, 2, 0),
        singerAt(fixture.stageId, 3, 1),
      ],
    };
    await buildUsualSetup({
      db: schedulingTestDb,
      id: randomUUID(),
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      sourceTemplateTimeBlockId: fixture.serviceId,
      ...twoShifts,
    });
    signIn('leader');

    const res = await list(fixture.worshipId);

    expect(res.json().blocks[1].entry).toEqual(twoShifts);
  });
});

describe('Usual setup review after template changes', () => {
  // Service is 10:00–12:00; this split fills it.
  const manualSplit = {
    kind: 'manual' as const,
    spans: [
      { startTime: '10:00', endTime: '11:00' },
      { startTime: '11:00', endTime: '12:00' },
    ],
  };
  const manualEntry = () => ({
    serves: true,
    shiftSplit: manualSplit,
    headcounts: [
      singerAt(fixture.stageId, 2, 0),
      singerAt(fixture.stageId, 3, 1),
    ],
  });

  async function seedManual() {
    await buildUsualSetup({
      db: schedulingTestDb,
      id: randomUUID(),
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      sourceTemplateTimeBlockId: fixture.serviceId,
      ...manualEntry(),
    });
  }

  function retime(startTime: string, endTime: string, label?: string) {
    return schedulingTestDb
      .update(templateTimeBlock)
      .set({
        startTime: parseTimeOfDay({ value: startTime }),
        endTime: parseTimeOfDay({ value: endTime }),
        ...(label ? { label } : {}),
      })
      .where(eq(templateTimeBlock.id, fixture.serviceId));
  }

  async function serviceBlock() {
    signIn('leader');
    const res = await list(fixture.worshipId);
    return res
      .json()
      .blocks.find(
        (block: { sourceTemplateTimeBlockId: string }) =>
          block.sourceTemplateTimeBlockId === fixture.serviceId,
      );
  }

  it('keeps setup without a flag after a relabel or an in-bounds retime', async () => {
    await seedManual();

    await retime('10:00', '12:00', 'Main service');
    expect(await serviceBlock()).toMatchObject({
      label: 'Main service',
      needsReview: false,
      entry: manualEntry(),
    });

    await retime('09:30', '12:30');
    expect((await serviceBlock()).needsReview).toBe(false);
  });

  it('flags a manual split outside the new bounds without touching its values', async () => {
    await seedManual();

    await retime('10:00', '11:30');

    expect(await serviceBlock()).toMatchObject({
      needsReview: true,
      entry: manualEntry(),
    });
    const [row] = await stored();
    expect(row?.shiftSplit).toMatchObject({ kind: 'manual' });
  });

  it('reads an invalid stored split instead of failing, then refuses a bad save and clears the flag on a valid repair', async () => {
    await seedManual();
    await schedulingTestDb.update(usualSetup).set({
      shiftSplit: {
        kind: 'manual',
        spans: [{ startTime: '10:00', endTime: '10:00' }],
      } as never,
    });
    expect((await serviceBlock()).needsReview).toBe(true);

    await retime('10:00', '11:30');
    signIn('leader');
    const refused = await save(
      fixture.worshipId,
      fixture.serviceId,
      manualEntry(),
    );
    expect(refused.statusCode).toBe(400);
    expect((await serviceBlock()).needsReview).toBe(true);

    const repaired = await save(fixture.worshipId, fixture.serviceId, {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [{ startTime: '10:00', endTime: '11:30' }],
      },
      headcounts: [singerAt(fixture.stageId, 5, 0)],
    });
    expect(repaired.statusCode).toBe(200);
    expect(repaired.json().needsReview).toBe(false);
    expect((await serviceBlock()).needsReview).toBe(false);
  });

  it('never flags equal splits or not-served entries', async () => {
    await buildUsualSetup({
      db: schedulingTestDb,
      id: randomUUID(),
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      sourceTemplateTimeBlockId: fixture.serviceId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [singerAt(fixture.stageId)],
    });

    await retime('10:00', '10:30');

    expect((await serviceBlock()).needsReview).toBe(false);
  });

  it('hides setup of a removed block, refuses its old URL, and gives a new block no entry', async () => {
    await seedManual();
    await schedulingTestDb
      .delete(templateTimeBlock)
      .where(eq(templateTimeBlock.id, fixture.serviceId));

    signIn('leader');
    const res = await list(fixture.worshipId);
    expect(
      res.json().blocks.map((block: { label: string }) => block.label),
    ).toEqual(['Welcome', 'Night']);
    expect(await stored()).toHaveLength(0);
    const old = await save(fixture.worshipId, fixture.serviceId, manualEntry());
    expect(old.statusCode).toBe(404);
  });
});

describe('PUT /ministries/:ministryId/usual-setup/:sourceTemplateTimeBlockId', () => {
  it('lets an own-Ministry leader save one block and returns its block view', async () => {
    signIn('leader');
    const entry = wholeBlock([
      singerAt(fixture.stageId, 2),
      singerAt(fixture.doorId, 1),
    ]);

    const res = await save(fixture.worshipId, fixture.welcomeId, entry);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sourceTemplateTimeBlockId: fixture.welcomeId,
      templateName: 'Sunday',
      label: 'Welcome',
      entry,
    });
    expect((await list(fixture.worshipId)).json().blocks[0].entry).toEqual(
      entry,
    );
  });

  it('lets a ChurchAdmin without a Volunteer profile save any active Ministry', async () => {
    signIn('admin');

    const res = await save(
      fixture.kidsId,
      fixture.vigilId,
      wholeBlock([
        {
          shiftIndex: 0,
          sectorId: fixture.kidsRoomId,
          roleId: fixture.kidsRoleId,
          peopleNeeded: 4,
        },
      ]),
    );

    expect(res.statusCode).toBe(200);
  });

  it('keeps different counts per Shift for the same Sector and Role', async () => {
    signIn('leader');
    const entry = {
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [
        singerAt(fixture.stageId, 2, 0),
        singerAt(fixture.stageId, 5, 1),
      ],
    };

    const res = await save(fixture.worshipId, fixture.serviceId, entry);

    expect(res.statusCode).toBe(200);
    expect(res.json().entry).toEqual(entry);
  });

  describe('manual splits', () => {
    const span = (startTime: string, endTime: string) => ({
      startTime,
      endTime,
    });
    const manual = (spans: unknown[], headcounts?: unknown[]) => ({
      serves: true,
      shiftSplit: { kind: 'manual', spans },
      headcounts: headcounts ?? [singerAt(fixture.stageId, 2)],
    });

    it('saves ordered spans inside the block, allowing gaps and touching ends', async () => {
      signIn('leader');
      const entry = manual(
        [
          span('10:00', '10:30'),
          span('10:30', '11:00'),
          span('11:30', '12:00'),
        ],
        [
          singerAt(fixture.stageId, 2, 0),
          singerAt(fixture.doorId, 1, 2),
          singerAt(fixture.stageId, 4, 2),
        ],
      );

      const res = await save(fixture.worshipId, fixture.serviceId, entry);

      expect(res.statusCode).toBe(200);
      expect(res.json().entry).toEqual(entry);
    });

    it.each([
      ['an empty split', () => []],
      ['a zero-duration span', () => [span('10:30', '10:30')]],
      ['a span ending past the block', () => [span('11:00', '12:30')]],
      ['a span starting before the block', () => [span('09:30', '11:00')]],
      [
        'overlapping spans',
        () => [span('10:00', '11:00'), span('10:30', '11:30')],
      ],
      [
        'spans out of chronological order',
        () => [span('11:00', '12:00'), span('10:00', '11:00')],
      ],
    ])('refuses %s with 400 INVALID_SHIFT_SPLIT and keeps the saved entry', async (_case, spans) => {
      signIn('leader');
      await save(
        fixture.worshipId,
        fixture.serviceId,
        wholeBlock([singerAt(fixture.doorId)]),
      );
      const before = await stored();

      const res = await save(
        fixture.worshipId,
        fixture.serviceId,
        manual(spans()),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'INVALID_SHIFT_SPLIT' });
      expect(await stored()).toEqual(before);
    });

    it('resolves overnight blocks and spans after the block start, not lexically', async () => {
      signIn('leader');
      const night = await buildEventTemplate({
        db: schedulingTestDb,
        churchId: CHURCH_A,
        name: 'Night',
        weekday: 5,
        blocks: [
          {
            label: 'Watch',
            startTime: parseTimeOfDay({ value: '22:00' }),
            endTime: parseTimeOfDay({ value: '02:00' }),
          },
        ],
      });
      const [watch] = night.blocks;
      if (!watch) throw new Error('block seed failed');

      const fits = manual([span('22:00', '00:00'), span('00:00', '01:30')]);
      expect((await save(fixture.worshipId, watch.id, fits)).statusCode).toBe(
        200,
      );

      for (const spans of [
        [span('21:00', '23:00')],
        [span('23:00', '03:00')],
        [span('00:30', '01:00'), span('23:00', '23:30')],
      ]) {
        const res = await save(fixture.worshipId, watch.id, manual(spans));
        expect(res.statusCode).toBe(400);
      }
    });
  });

  it('saves an explicit opt-out in the canonical form, dropping any sent split or counts', async () => {
    signIn('leader');

    const res = await save(fixture.worshipId, fixture.welcomeId, {
      serves: false,
      shiftSplit: { kind: 'equal', count: 3 },
      headcounts: [singerAt(fixture.stageId)],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().entry).toEqual({
      serves: false,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    });
  });

  it('replaces only its own block, also when two blocks save concurrently', async () => {
    signIn('leader');
    await save(
      fixture.worshipId,
      fixture.vigilId,
      wholeBlock([singerAt(fixture.doorId)]),
    );

    const [welcome, service] = await Promise.all([
      save(
        fixture.worshipId,
        fixture.welcomeId,
        wholeBlock([singerAt(fixture.stageId, 1)]),
      ),
      save(
        fixture.worshipId,
        fixture.serviceId,
        wholeBlock([singerAt(fixture.stageId, 2)]),
      ),
    ]);
    const again = await save(
      fixture.worshipId,
      fixture.welcomeId,
      wholeBlock([singerAt(fixture.stageId, 7)]),
    );

    expect([welcome.statusCode, service.statusCode, again.statusCode]).toEqual([
      200, 200, 200,
    ]);
    const counts = Object.fromEntries(
      (await stored()).map((row) => [
        row.sourceTemplateTimeBlockId,
        row.headcounts.map(({ peopleNeeded }) => peopleNeeded),
      ]),
    );
    expect(counts).toEqual({
      [fixture.welcomeId]: [7],
      [fixture.serviceId]: [2],
      [fixture.vigilId]: [1],
    });
  });

  it.each([
    ['an empty serving entry', 'USUAL_SETUP_EMPTY', () => wholeBlock([])],
    [
      'the same Sector and Role twice in one Shift',
      'DUPLICATE_HEADCOUNT',
      () =>
        wholeBlock([
          singerAt(fixture.stageId, 1),
          singerAt(fixture.stageId, 2),
        ]),
    ],
    [
      'a count for a Shift the split does not generate',
      'INVALID_SHIFT_INDEX',
      () => wholeBlock([singerAt(fixture.stageId, 1, 1)]),
    ],
  ])('refuses %s with 422 %s and keeps the saved entry', async (_case, reason, entry) => {
    signIn('leader');
    const kept = wholeBlock([singerAt(fixture.doorId)]);
    await save(fixture.worshipId, fixture.welcomeId, kept);
    const before = await stored();

    const res = await save(fixture.worshipId, fixture.welcomeId, entry());

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'VALIDATION_ERROR', reason });
    expect(await stored()).toEqual(before);
  });

  it('words the empty refusal from the catalog in the request locale', async () => {
    signIn('leader');

    const res = await save(
      fixture.worshipId,
      fixture.welcomeId,
      wholeBlock([]),
    );

    expect(res.json().message).toBe(
      m.error_validation_usual_setup_empty({}, PT_BR),
    );
  });

  it.each([
    0, -1, 1.5,
  ])('refuses a raw count of %s at the boundary', async (peopleNeeded) => {
    signIn('leader');

    const res = await save(
      fixture.worshipId,
      fixture.welcomeId,
      wholeBlock([singerAt(fixture.stageId, peopleNeeded)]),
    );

    expect(res.statusCode).toBe(422);
    expect(await stored()).toEqual([]);
  });

  it('refuses archived, other-Ministry and foreign registries with 404, keeping the saved entry', async () => {
    signIn('leader');
    const kept = wholeBlock([singerAt(fixture.doorId)]);
    await save(fixture.worshipId, fixture.welcomeId, kept);
    const before = await stored();

    for (const headcount of [
      singerAt(fixture.archivedSectorId),
      singerAt(fixture.kidsRoomId),
      { ...singerAt(fixture.stageId), roleId: fixture.archivedRoleId },
      { ...singerAt(fixture.stageId), roleId: fixture.kidsRoleId },
      { ...singerAt(fixture.stageId), roleId: randomUUID() },
    ]) {
      const res = await save(
        fixture.worshipId,
        fixture.welcomeId,
        wholeBlock([headcount]),
      );
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
    }
    expect(await stored()).toEqual(before);
  });

  it('refuses a missing or foreign-Church block with 404 and writes nothing', async () => {
    signIn('leader');

    for (const blockId of [randomUUID(), fixture.foreignBlockId]) {
      const res = await save(
        fixture.worshipId,
        blockId,
        wholeBlock([singerAt(fixture.stageId)]),
      );
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: 'NOT_FOUND',
        message: m.error_not_found({}, PT_BR),
      });
    }
    expect(await stored()).toEqual([]);
  });
});

describe('Usual setup authorization', () => {
  it('answers 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const responses = [
      await list(fixture.worshipId),
      await save(fixture.worshipId, fixture.welcomeId, wholeBlock([])),
    ];

    expect(responses.map((res) => res.statusCode)).toEqual([401, 401]);
  });

  it.each([
    'volunteer',
    'member',
  ] as const)('answers 403 to a %s without Ministry management', async (persona) => {
    signIn(persona);

    const responses = [
      await list(fixture.worshipId),
      await save(
        fixture.worshipId,
        fixture.welcomeId,
        wholeBlock([singerAt(fixture.stageId)]),
      ),
    ];

    expect(responses.map((res) => res.json().error)).toEqual([
      'FORBIDDEN',
      'FORBIDDEN',
    ]);
    expect(await stored()).toEqual([]);
  });

  it('answers the same 404 for another, archived, foreign and missing Ministry', async () => {
    const leaderTargets = [fixture.worshipId];
    const adminTargets = [
      fixture.archivedMinistryId,
      fixture.foreignMinistryId,
      randomUUID(),
    ];

    for (const [persona, targets] of [
      ['otherLeader', leaderTargets],
      ['admin', adminTargets],
    ] as const) {
      signIn(persona);
      for (const ministryId of targets) {
        for (const res of [
          await list(ministryId),
          await save(
            ministryId,
            fixture.welcomeId,
            wholeBlock([singerAt(fixture.stageId)]),
          ),
        ]) {
          expect(res.statusCode).toBe(404);
          expect(res.json()).toEqual({
            error: 'NOT_FOUND',
            message: m.error_not_found({}, PT_BR),
          });
        }
      }
    }
    expect(await stored()).toEqual([]);
  });
});
