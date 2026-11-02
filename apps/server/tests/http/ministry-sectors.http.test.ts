import { randomUUID } from 'node:crypto';
import { ministry, sector } from '@church/db';
import { m } from '@church/i18n/messages';
import {
  addCalendarDays,
  type Instant,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  setTestClock,
} from '@church/time';
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
import { SectorController } from '@/api/controllers/sector-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DbSectorManager } from '@/application/db-sector-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
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
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  schedulingTestPool,
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
  // The competing UsualSetup write path, for the archive race proof.
  const churchAdmin = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: {} as never,
    planningEventManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    participationManager: createSchedulingManagers().participationManager,
    ministryManager: {} as never,
    authorityGuard,
  });
  const controller = new SectorController({
    ministryManager: new DbMinistryManager({
      ministryRepo,
      volunteerRepo: new DrizzleVolunteerRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    sectorManager: new DbSectorManager({
      sectorRepository: new DrizzleSectorRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard,
  });
  await app.register(
    async (instance) => {
      for (const registered of [controller, churchAdmin]) {
        instance.register(registered.registerRoutes.bind(registered), {
          prefix: registered.prefix,
        });
      }
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

const CHURCH_A = '71111111-1111-4111-8111-111111111111';
const CHURCH_B = '72222222-2222-4222-8222-222222222222';
const NOW = parseInstant({ value: '2026-06-10T12:00:00Z' });

/** `leader` leads only Worship; `otherLeader` leads only Kids. */
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
  stageId: string;
  babiesId: string;
  archivedSectorId: string;
  kidsRoomId: string;
  foreignSectorId: string;
  roleId: string;
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
  const userId = `sector-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@test.com` });
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

async function seed(): Promise<Fixture> {
  const db = schedulingTestDb;
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'sector-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'sector-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const archivedMinistry = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Old',
  });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archivedMinistry.id));
  const foreign = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  const child = { db, churchId: CHURCH_A, ministryId: worship.id };
  const stage = await buildSector({ ...child, name: 'stage' });
  const babies = await buildSector({ ...child, name: 'Babies Room' });
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
  const foreignSector = await buildSector({
    db,
    churchId: CHURCH_B,
    ministryId: foreign.id,
    name: 'Foreign Room',
  });
  const role = await buildRole({ ...child, name: 'Singer' });
  return {
    worshipId: worship.id,
    kidsId: kids.id,
    archivedMinistryId: archivedMinistry.id,
    foreignMinistryId: foreign.id,
    stageId: stage.id,
    babiesId: babies.id,
    archivedSectorId: archivedSector.id,
    kidsRoomId: kidsRoom.id,
    foreignSectorId: foreignSector.id,
    roleId: role.id,
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
  setTestClock({ instant: NOW });
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

const PT_BR = { locale: 'pt-BR' as const };

function base(ministryId: string) {
  return `/api/v1/ministries/${ministryId}/sectors`;
}

function list(ministryId: string) {
  return app.inject({ method: 'GET', url: base(ministryId) });
}

function create(ministryId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: base(ministryId),
    payload: payload as never,
  });
}

function rename(ministryId: string, sectorId: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `${base(ministryId)}/${sectorId}`,
    payload: payload as never,
  });
}

function archive(ministryId: string, sectorId: string) {
  return app.inject({
    method: 'POST',
    url: `${base(ministryId)}/${sectorId}/archive`,
  });
}

async function listedNames(ministryId: string) {
  const res = await list(ministryId);
  return res.json().sectors.map((item: { name: string }) => item.name);
}

async function storedSector(sectorId: string) {
  const [row] = await schedulingTestDb
    .select()
    .from(sector)
    .where(eq(sector.id, sectorId));
  return row;
}

describe('GET /ministries/:ministryId/sectors', () => {
  it('lists active Sectors alphabetically ignoring case for an admin without a Volunteer profile and the Ministry leader', async () => {
    for (const persona of ['admin', 'leader'] as const) {
      signIn(persona);

      const res = await list(fixture.worshipId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        sectors: [
          { id: fixture.babiesId, name: 'Babies Room' },
          { id: fixture.stageId, name: 'stage' },
        ],
      });
    }
  });

  it.each([
    'volunteer',
    'member',
  ] as const)('refuses a %s with 403 before looking the Ministry up', async (persona) => {
    signIn(persona);

    expect((await list(fixture.worshipId)).statusCode).toBe(403);
    expect((await list(randomUUID())).statusCode).toBe(403);
  });

  it('answers the same 404 for another led Ministry, an archived, a foreign, a missing and a malformed one', async () => {
    signIn('otherLeader');
    expect((await list(fixture.worshipId)).statusCode).toBe(404);

    signIn('admin');
    for (const id of [
      fixture.archivedMinistryId,
      fixture.foreignMinistryId,
      randomUUID(),
      'nope',
    ]) {
      const res = await list(id);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: 'NOT_FOUND',
        message: m.error_not_found({}, PT_BR),
      });
    }
  });
});

describe('POST /ministries/:ministryId/sectors', () => {
  it('creates a trimmed Sector for either manager and lists it', async () => {
    signIn('leader');
    const res = await create(fixture.worshipId, { name: '  Main Door  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: 'Main Door' });

    signIn('admin');
    expect(
      (await create(fixture.worshipId, { name: 'Altar' })).statusCode,
    ).toBe(201);
    expect(await listedNames(fixture.worshipId)).toEqual([
      'Altar',
      'Babies Room',
      'Main Door',
      'stage',
    ]);
  });

  it('refuses an active case-insensitive duplicate with a localized 409, but reuses an archived name and another Ministry name', async () => {
    signIn('admin');

    const res = await create(fixture.worshipId, { name: ' BABIES ROOM ' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'SECTOR_NAME_IN_USE',
      message: m.error_sector_name_in_use({}, PT_BR),
    });
    const reused = await create(fixture.worshipId, { name: 'old door' });
    expect(reused.statusCode).toBe(201);
    expect(reused.json().id).not.toBe(fixture.archivedSectorId);
    expect(
      (await create(fixture.worshipId, { name: 'Kids Room' })).statusCode,
    ).toBe(201);
  });

  it('lets exactly one of two concurrent case-variant creates win', async () => {
    signIn('admin');

    const results = await Promise.all([
      create(fixture.worshipId, { name: 'Race' }),
      create(fixture.worshipId, { name: 'RACE' }),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
  });

  it.each([
    { name: '   ' },
    { name: 'x'.repeat(256) },
    {},
  ])('refuses %j with 422 VALIDATION_ERROR', async (payload) => {
    signIn('admin');

    const res = await create(fixture.worshipId, payload);

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
  });

  it('refuses a leader of another Ministry with 404 and a Volunteer with 403, creating nothing', async () => {
    signIn('otherLeader');
    expect((await create(fixture.worshipId, { name: 'X' })).statusCode).toBe(
      404,
    );
    signIn('volunteer');
    expect((await create(fixture.worshipId, { name: 'X' })).statusCode).toBe(
      403,
    );
    signIn('admin');
    expect(await listedNames(fixture.worshipId)).toEqual([
      'Babies Room',
      'stage',
    ]);
  });
});

describe('PATCH /ministries/:ministryId/sectors/:sectorId', () => {
  it('renames the same identity, an unchanged name and a case-only change', async () => {
    signIn('leader');

    const res = await rename(fixture.worshipId, fixture.stageId, {
      name: ' Platform ',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: fixture.stageId, name: 'Platform' });
    expect(
      (await rename(fixture.worshipId, fixture.stageId, { name: 'Platform' }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await rename(fixture.worshipId, fixture.stageId, { name: 'PLATFORM' })
      ).json().name,
    ).toBe('PLATFORM');
  });

  it('refuses another active Sector name ignoring case with 409, but allows an archived one', async () => {
    signIn('admin');

    const res = await rename(fixture.worshipId, fixture.stageId, {
      name: 'babies room',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('SECTOR_NAME_IN_USE');
    expect(
      (await rename(fixture.worshipId, fixture.stageId, { name: 'OLD DOOR' }))
        .statusCode,
    ).toBe(200);
  });

  it('answers 404 for an archived Sector, a Sector of another Ministry or Church, and a missing one, changing nothing', async () => {
    signIn('admin');

    for (const sectorId of [
      fixture.archivedSectorId,
      fixture.kidsRoomId,
      fixture.foreignSectorId,
      randomUUID(),
      'nope',
    ]) {
      expect(
        (await rename(fixture.worshipId, sectorId, { name: 'New' })).statusCode,
      ).toBe(404);
    }
    expect((await storedSector(fixture.kidsRoomId))?.name).toBe('Kids Room');
    expect((await storedSector(fixture.archivedSectorId))?.name).toBe(
      'Old Door',
    );
  });
});

interface PlanningEventInput {
  title: string;
  start: Instant;
  end: Instant;
}

/** A Cycle Event with one block where Worship requires the Sector. */
async function seedRequirement(
  sectorId: string,
  { title, start, end }: PlanningEventInput,
) {
  const db = schedulingTestDb;
  // One Cycle per Event: Cycles of a Church never overlap.
  const day = start.slice(0, 10);
  const cycle = await buildCycle({
    db,
    churchId: CHURCH_A,
    name: `Cycle ${title}`,
    startDate: parseCalendarDay({ value: day }),
    endDate: addCalendarDays({
      day: parseCalendarDay({ value: day }),
      days: 1,
    }),
    state: 'draft',
  });
  const event = await buildEvent({
    db,
    churchId: CHURCH_A,
    cycleId: cycle.id,
    title,
    start,
    end,
    status: 'draft',
  });
  const block = await buildEventTimeBlock({
    db,
    churchId: CHURCH_A,
    eventId: event.id,
    start,
    end,
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId: CHURCH_A,
    ministryId: fixture.worshipId,
    eventId: event.id,
    state: 'preparing',
    eventTimeBlockIds: [block.id],
  });
  // Two Shifts in the block still make one blocker location.
  for (const half of [0, 1]) {
    const shift = await buildShift({
      db,
      churchId: CHURCH_A,
      participationId: participation.id,
      eventTimeBlockId: block.id,
      start,
      end,
      label: `half ${half}`,
    });
    await buildShiftRequirement({
      db,
      churchId: CHURCH_A,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: fixture.roleId,
      sectorId,
      peopleNeeded: 1,
    });
  }
  return { cycle, event, block };
}

async function seedUsualSetup(sectorId: string) {
  const db = schedulingTestDb;
  const template = await buildEventTemplate({
    db,
    churchId: CHURCH_A,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Morning',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '11:00' }),
      },
    ],
  });
  const [block] = template.blocks;
  if (!block) throw new Error('block seed failed');
  await buildUsualSetup({
    db,
    churchId: CHURCH_A,
    ministryId: fixture.worshipId,
    sourceTemplateTimeBlockId: block.id,
    id: randomUUID(),
    serves: false,
    shiftSplit: { kind: 'equal', count: 1 },
    headcounts: [{ sectorId, roleId: fixture.roleId, peopleNeeded: 2 }],
  });
  return block;
}

describe('POST /ministries/:ministryId/sectors/:sectorId/archive', () => {
  it('archives an unused Sector, keeping its identity and name for history and freeing the name', async () => {
    signIn('leader');

    const res = await archive(fixture.worshipId, fixture.stageId);

    expect(res.statusCode).toBe(204);
    expect(await listedNames(fixture.worshipId)).toEqual(['Babies Room']);
    expect(await storedSector(fixture.stageId)).toMatchObject({
      id: fixture.stageId,
      name: 'stage',
      archivedAt: expect.any(Date),
    });
    expect(
      (await create(fixture.worshipId, { name: 'Stage' })).statusCode,
    ).toBe(201);
  });

  it('archives a Sector only used by past requirements', async () => {
    await seedRequirement(fixture.stageId, {
      title: 'Past',
      start: parseInstant({ value: '2026-06-01T12:00:00Z' }),
      end: parseInstant({ value: '2026-06-01T14:00:00Z' }),
    });
    signIn('admin');

    expect((await archive(fixture.worshipId, fixture.stageId)).statusCode).toBe(
      204,
    );
  });

  it('refuses with typed requirement locations for ongoing and future Events, localized, leaving the Sector active', async () => {
    const ongoing = await seedRequirement(fixture.stageId, {
      title: 'Ongoing',
      start: parseInstant({ value: '2026-06-10T11:00:00Z' }),
      end: parseInstant({ value: '2026-06-10T13:00:00Z' }),
    });
    const future = await seedRequirement(fixture.stageId, {
      title: 'Future',
      start: parseInstant({ value: '2026-06-20T12:00:00Z' }),
      end: parseInstant({ value: '2026-06-20T14:00:00Z' }),
    });
    await seedRequirement(fixture.stageId, {
      title: 'Past',
      start: parseInstant({ value: '2026-06-01T12:00:00Z' }),
      end: parseInstant({ value: '2026-06-01T14:00:00Z' }),
    });
    signIn('admin');

    const res = await archive(fixture.worshipId, fixture.stageId);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'SECTOR_IN_USE',
      message: m.error_sector_in_use({}, PT_BR),
      blockers: [ongoing, future].map(({ cycle, event, block }) => ({
        kind: 'requirement',
        ministryId: fixture.worshipId,
        ministryName: 'Worship',
        cycleId: cycle.id,
        cycleName: cycle.name,
        eventId: event.id,
        eventTimeBlockId: block.id,
      })),
    });
    expect((await storedSector(fixture.stageId))?.archivedAt).toBeNull();
  });

  it('refuses with a UsualSetup location for a retained headcount without any upcoming Event', async () => {
    const block = await seedUsualSetup(fixture.babiesId);
    signIn('leader');

    const res = await archive(fixture.worshipId, fixture.babiesId);

    expect(res.statusCode).toBe(409);
    expect(res.json().blockers).toEqual([
      {
        kind: 'usual_setup',
        ministryId: fixture.worshipId,
        ministryName: 'Worship',
        templateTimeBlockId: block.id,
      },
    ]);
    expect((await storedSector(fixture.babiesId))?.archivedAt).toBeNull();
  });

  it('answers 404 for an already archived Sector and one of another Ministry or Church', async () => {
    signIn('admin');

    for (const sectorId of [
      fixture.archivedSectorId,
      fixture.kidsRoomId,
      fixture.foreignSectorId,
      randomUUID(),
    ]) {
      expect((await archive(fixture.worshipId, sectorId)).statusCode).toBe(404);
    }
    expect((await storedSector(fixture.kidsRoomId))?.archivedAt).toBeNull();
  });

  it('refuses a leader of another Ministry with 404 and a plain member with 403', async () => {
    signIn('otherLeader');
    expect((await archive(fixture.worshipId, fixture.stageId)).statusCode).toBe(
      404,
    );
    signIn('member');
    expect((await archive(fixture.worshipId, fixture.stageId)).statusCode).toBe(
      403,
    );
    expect((await storedSector(fixture.stageId))?.archivedAt).toBeNull();
  });
});

interface Gate {
  entered: Promise<void>;
  release: () => void;
}

/** Pauses the first call of `method` inside its transaction until released. */
function gate(prototype: object, method: string): Gate {
  let enter = () => {};
  let release = () => {};
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  type Method = (...args: unknown[]) => Promise<unknown>;
  const methods = prototype as Record<string, Method>;
  const original = methods[method] as Method;
  vi.spyOn(methods, method).mockImplementationOnce(async function (
    this: unknown,
    ...args: unknown[]
  ) {
    enter();
    await released;
    return original.apply(this, args);
  });
  return { entered, release };
}

/** Resolves once a statement of this database waits on a row lock (bounded). */
async function lockWaitObserved() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await schedulingTestPool.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].waiting > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

function putUsualSetup(templateTimeBlockId: string, sectorId: string) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/admin/ministries/${fixture.worshipId}/usual-setup`,
    payload: {
      entries: [
        {
          sourceTemplateTimeBlockId: templateTimeBlockId,
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [{ sectorId, roleId: fixture.roleId, peopleNeeded: 1 }],
        },
      ],
    },
  });
}

describe('archive racing a UsualSetup write', () => {
  it('waits for an in-flight write that uses the Sector, then refuses with its location', async () => {
    const block = await seedUsualSetup(fixture.stageId);
    signIn('admin');
    const write = gate(
      DrizzleUsualSetupRepository.prototype,
      'replaceForMinistry',
    );

    const put = putUsualSetup(block.id, fixture.babiesId);
    await write.entered;
    const archived = archive(fixture.worshipId, fixture.babiesId);
    const waited = await lockWaitObserved();
    write.release();
    expect(waited).toBe(true);

    expect((await put).statusCode).toBe(200);
    const res = await archived;
    expect(res.statusCode).toBe(409);
    expect(res.json().blockers).toEqual([
      expect.objectContaining({
        kind: 'usual_setup',
        templateTimeBlockId: block.id,
      }),
    ]);
    expect((await storedSector(fixture.babiesId))?.archivedAt).toBeNull();
  });

  it('makes a write that waits on an in-flight archive refuse the archived Sector, keeping the stored setup', async () => {
    const block = await seedUsualSetup(fixture.stageId);
    signIn('admin');
    const guard = gate(
      DrizzleSectorRepository.prototype,
      'listArchiveBlockers',
    );

    const archived = archive(fixture.worshipId, fixture.babiesId);
    await guard.entered;
    const put = putUsualSetup(block.id, fixture.babiesId);
    const waited = await lockWaitObserved();
    guard.release();
    expect(waited).toBe(true);

    expect((await archived).statusCode).toBe(204);
    expect((await put).statusCode).toBe(404);
    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/ministries/${fixture.worshipId}/usual-setup`,
    });
    expect(read.json().entries[0].headcounts).toEqual([
      { sectorId: fixture.stageId, roleId: fixture.roleId, peopleNeeded: 2 },
    ]);
  });
});

describe('authentication', () => {
  it('answers 401 without a session on every endpoint', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const responses = await Promise.all([
      list(fixture.worshipId),
      create(fixture.worshipId, { name: 'X' }),
      rename(fixture.worshipId, fixture.stageId, { name: 'X' }),
      archive(fixture.worshipId, fixture.stageId),
    ]);

    expect(responses.map((res) => res.statusCode)).toEqual([
      401, 401, 401, 401,
    ]);
  });
});
