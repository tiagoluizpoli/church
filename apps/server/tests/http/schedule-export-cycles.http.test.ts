import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appConfig } from '@church/app-config';
import {
  parseCalendarDay,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
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
import type { FastifyTypedInstance } from '@/main/fastify/types';
import {
  buildCycle,
  buildEvent,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { buildScheduleExportApp } from '@/tests/test-support/schedule-export-app';
import {
  EXPORT_CHURCH_A,
  type ExportPersona,
  local,
  type ScheduleExportFixture,
  seedScheduleExport,
} from '@/tests/test-support/schedule-export-fixture';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const db = schedulingTestDb;
const activeChurchResolver = { resolve: vi.fn() };

let app: FastifyTypedInstance;
let fixture: ScheduleExportFixture;

beforeAll(async () => {
  app = await buildScheduleExportApp({ activeChurchResolver });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: '2026-11-10T12:00:00Z' }) });
  await resetSchedulingPhase3Db();
  fixture = await seedScheduleExport();
  signIn('leader');
});

afterEach(() => {
  resetClock();
});

function signIn(persona: ExportPersona) {
  const { userId, volunteerId } = fixture.personas[persona];
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: EXPORT_CHURCH_A,
    volunteerId,
    autoSelected: false,
  });
}

/** A Kids Schedule (one Event) in a new Cycle. */
async function kidsCycle(name: string, startDate: string, endDate: string) {
  const created = await buildCycle({
    db,
    churchId: EXPORT_CHURCH_A,
    name,
    state: 'sent',
    startDate: parseCalendarDay({ value: startDate }),
    endDate: parseCalendarDay({ value: endDate }),
  });
  const sunday = await buildEvent({
    db,
    churchId: EXPORT_CHURCH_A,
    cycleId: created.id,
    title: 'Culto',
    start: local(startDate, '09:00'),
    end: local(startDate, '12:00'),
    status: 'scheduled',
  });
  await buildMinistryParticipation({
    db,
    churchId: EXPORT_CHURCH_A,
    ministryId: fixture.kidsId,
    eventId: sunday.id,
    state: 'published',
    eventTimeBlockIds: [],
  });
  return created.id;
}

function listCycles(q?: string, ministryId = fixture.kidsId) {
  const query = q === undefined ? '' : `?q=${encodeURIComponent(q)}`;
  return app.inject({
    method: 'GET',
    url: `/api/v1/export/ministries/${ministryId}/cycles${query}`,
    cookies: { [appConfig.localeCookieName]: 'pt-BR' },
  });
}

interface RangeRequest {
  kind?: 'data' | 'file';
  from?: string;
  to?: string;
  locale?: 'en' | 'pt-BR';
}

function readRange({
  kind = 'data',
  from,
  to,
  locale = 'pt-BR',
}: RangeRequest) {
  const query = new URLSearchParams({
    ...(kind === 'file' && { format: 'pdf' }),
    ...(from && { from }),
    ...(to && { to }),
  });
  return app.inject({
    method: 'GET',
    url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${fixture.octoberId}/${kind}?${query}`,
    cookies: { [appConfig.localeCookieName]: locale },
  });
}

describe('GET /export/ministries/:ministryId/cycles', () => {
  it('lists only Cycles where the Ministry has a Schedule, newest first, marking the current one', async () => {
    await kidsCycle('1º trimestre 2026', '2026-01-01', '2026-03-31');

    const response = await listCycles();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cycles: [
        {
          id: fixture.novemberId,
          name: 'Novembro 2026',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          isCurrent: true,
        },
        {
          id: fixture.octoberId,
          name: 'Outubro 2026',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          isCurrent: false,
        },
        {
          id: expect.any(String),
          name: '1º trimestre 2026',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          isCurrent: false,
        },
      ],
    });
  });

  it('searches the name, dates and any month covered, ignoring case and accents', async () => {
    const quarter = await kidsCycle(
      '1º trimestre 2026',
      '2026-01-01',
      '2026-03-31',
    );
    const names = async (q: string) =>
      (await listCycles(q))
        .json()
        .cycles.map((found: { id: string }) => found.id);

    expect(await names('fev 2026')).toEqual([quarter]);
    expect(await names('Março')).toEqual([quarter]);
    expect(await names('TRIMESTRE')).toEqual([quarter]);
    expect(await names('novémbro')).toEqual([fixture.novemberId]);
    expect(await names('out')).toEqual([fixture.octoberId]);
    expect(await names('15/10/2026')).toEqual([]);
    expect(await names('01/10/2026')).toEqual([fixture.octoberId]);
    expect(await names('2026-11-30')).toEqual([fixture.novemberId]);
    expect(await names('fev 2027')).toEqual([]);
    expect(await names('100%')).toEqual([]);
  });

  it('refuses a volunteer, another Ministry and another Church', async () => {
    signIn('volunteer');
    expect((await listCycles()).statusCode).toBe(403);
    signIn('otherLeader');
    expect((await listCycles()).statusCode).toBe(404);
    signIn('admin');
    expect(
      (await listCycles(undefined, fixture.foreignMinistryId)).statusCode,
    ).toBe(404);
  });
});

describe('from/to on the export data and file', () => {
  it('keeps the Events whose start day is in the inclusive range', async () => {
    const body = (
      await readRange({ from: '2026-10-07', to: '2026-10-24' })
    ).json();

    expect(body.range).toEqual({ from: '2026-10-07', to: '2026-10-24' });
    expect(
      body.parts[0].groups[0].events.map(
        (found: { startDay: string; title: string }) =>
          `${found.startDay} ${found.title}`,
      ),
    ).toEqual([
      '2026-10-07 Culto de Quarta',
      '2026-10-11 Culto da Família',
      '2026-10-14 Culto de Quarta',
      '2026-10-24 Retiro',
    ]);
  });

  it('reads the whole Cycle when a side is left open', async () => {
    const body = (await readRange({ to: '2026-10-04' })).json();

    expect(body.range).toEqual({ from: '2026-10-01', to: '2026-10-04' });
    expect(body.parts[0].groups[0].events).toHaveLength(1);
    expect((await readRange({})).json().range).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it.each([
    'data',
    'file',
  ] as const)('refuses a %s range outside the Cycle, showing its span', async (kind) => {
    for (const range of [{ from: '2026-09-30' }, { to: '2026-11-01' }]) {
      const response = await readRange({ kind, ...range });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: 'EXPORT_RANGE_OUTSIDE_CYCLE',
        message: 'Escolha datas entre 01/10/2026 e 31/10/2026.',
      });
    }
    expect(
      (await readRange({ kind, from: '2026-09-30', locale: 'en' })).json()
        .message,
    ).toBe('Pick dates between 01/10/2026 and 31/10/2026.');
  });

  it.each([
    'data',
    'file',
  ] as const)('refuses a %s range whose start is after its end', async (kind) => {
    const response = await readRange({
      kind,
      from: '2026-10-10',
      to: '2026-10-09',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'INVALID_DATE_RANGE',
      message: 'A data de término não pode ser anterior à data de início.',
    });
  });

  it('refuses a Cycle with no Schedule with its own code', async () => {
    signIn('admin');
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${fixture.decemberId}/data`,
      cookies: { [appConfig.localeCookieName]: 'pt-BR' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'EXPORT_SCHEDULE_NOT_FOUND',
      message: 'Este ministério não tem escala neste ciclo.',
    });
  });

  it('prints the chosen range under the title of the PDF', async () => {
    const response = await readRange({
      kind: 'file',
      from: '2026-10-07',
      to: '2026-10-14',
    });

    expect(response.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), 'export-range-'));
    const path = join(dir, 'out.pdf');
    writeFileSync(path, response.rawPayload);
    const text = execFileSync('pdftotext', ['-layout', path, '-'], {
      encoding: 'utf8',
    }).replace(/\s+/g, ' ');
    expect(text).toContain('07/10/2026 – 14/10/2026');
    expect(text).toContain('Culto de Quarta');
    expect(text).not.toContain('Retiro');
    expect(text).not.toContain('Manhã');
  });
});
