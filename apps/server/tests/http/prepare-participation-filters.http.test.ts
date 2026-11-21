import { appConfig } from '@church/app-config';
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
import {
  createSchedulingManagers,
  seedInclusion,
  seedRequirement,
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
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new PrepareController({
    config: appConfig,
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

interface SeedBlockInput {
  title: string;
  start: string;
  end: string;
  included: boolean;
  headcount: boolean;
}

async function seedCycle() {
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
  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    state: 'sent',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  const sector = await buildSector({
    db: schedulingTestDb,
    churchId,
    ministryId,
    name: 'Room',
  });

  async function seedBlock({
    title,
    start,
    end,
    included,
    headcount,
  }: SeedBlockInput) {
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      cycleId: cycle.id,
      ministryId,
      title,
      start: new Date(start),
      end: new Date(end),
      status: 'scheduled',
    });
    const scope = {
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
    };
    if (included) await seedInclusion(scope);
    const blockShift = await seedShift({
      ...scope,
      startTime: new Date(start),
      endTime: new Date(end),
      label: title,
    });
    if (headcount) {
      await seedRequirement({
        churchId,
        participationId: graph.participation.id,
        shiftId: blockShift.id,
        roleId: role.id,
        sectorId: sector.id,
        peopleNeeded: 2,
      });
    }
  }

  // Church timezone is America/Sao_Paulo (UTC-3).
  // Sunday 09:00-11:00 on the 6th, served, no headcount: needs attention.
  await seedBlock({
    title: 'Sunday Worship',
    start: '2026-09-06T12:00:00.000Z',
    end: '2026-09-06T14:00:00.000Z',
    included: true,
    headcount: false,
  });
  // 22:30-00:00 local on the 6th, but already the 7th in UTC.
  await seedBlock({
    title: 'Night Vigil',
    start: '2026-09-07T01:30:00.000Z',
    end: '2026-09-07T03:00:00.000Z',
    included: true,
    headcount: true,
  });
  // Wednesday 19:00-20:00 local, not served.
  await seedBlock({
    title: 'Midweek',
    start: '2026-09-09T22:00:00.000Z',
    end: '2026-09-09T23:00:00.000Z',
    included: false,
    headcount: false,
  });
  return { cycleId: cycle.id, ministryId };
}

interface FilteredViewInput {
  scope: Awaited<ReturnType<typeof seedCycle>>;
  query?: string;
}

async function getView({ scope, query = '' }: FilteredViewInput) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/prepare/cycles/${scope.cycleId}/participation?ministryId=${scope.ministryId}${query}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function titles(view: { events: { event: { title: string } }[] }): string[] {
  return view.events.map(({ event }) => event.title);
}

const ALL_DAYS = ['2026-09-06', '2026-09-09'];
const TOTALS = { blocks: 3, needsAttention: 1 };

describe('GET /prepare/cycles/:cycleId/participation filters', () => {
  it('orders blocks by start and reports unfiltered markers and totals', async () => {
    const scope = await seedCycle();
    const view = await getView({ scope });
    expect(titles(view)).toEqual(['Sunday Worship', 'Night Vigil', 'Midweek']);
    expect(view.dayMarkers).toEqual(ALL_DAYS);
    expect(view.totals).toEqual(TOTALS);
  });

  it('filters by church-local day, not the UTC day', async () => {
    const scope = await seedCycle();
    const view = await getView({ scope, query: '&day=2026-09-06' });
    expect(titles(view)).toEqual(['Sunday Worship', 'Night Vigil']);
    expect(view.dayMarkers).toEqual(ALL_DAYS);
    expect(view.totals).toEqual(TOTALS);
  });

  it('searches the Event title and block label case-insensitively', async () => {
    const scope = await seedCycle();
    expect(titles(await getView({ scope, query: '&q=%20VIGIL' }))).toEqual([
      'Night Vigil',
    ]);
    const byLabel = await getView({ scope, query: '&q=generated' });
    expect(titles(byLabel)).toHaveLength(3);
    expect(titles(await getView({ scope, query: '&q=nothing' }))).toEqual([]);
  });

  it('filters by time window in the church timezone for each mode', async () => {
    const scope = await seedCycle();
    const starts = await getView({
      scope,
      query: '&timeFrom=09:00&timeTo=11:00',
    });
    expect(titles(starts)).toEqual(['Sunday Worship']);
    const openEnded = await getView({ scope, query: '&timeFrom=19:00' });
    expect(titles(openEnded)).toEqual(['Night Vigil', 'Midweek']);
    const ends = await getView({
      scope,
      query: '&timeMode=ends&timeFrom=11:00&timeTo=11:00',
    });
    expect(titles(ends)).toEqual(['Sunday Worship']);
    const within = await getView({
      scope,
      query: '&timeMode=within&timeFrom=18:00&timeTo=21:00',
    });
    expect(titles(within)).toEqual(['Midweek']);
  });

  it('keeps only served blocks that need a headcount', async () => {
    const scope = await seedCycle();
    const view = await getView({ scope, query: '&needsAttention=true' });
    expect(titles(view)).toEqual(['Sunday Worship']);
    expect(view.totals).toEqual(TOTALS);
  });

  it('combines filters', async () => {
    const scope = await seedCycle();
    const view = await getView({
      scope,
      query: '&day=2026-09-06&needsAttention=true&q=sunday',
    });
    expect(titles(view)).toEqual(['Sunday Worship']);
  });
});
