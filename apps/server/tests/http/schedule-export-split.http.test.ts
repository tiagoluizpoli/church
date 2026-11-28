import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appConfig } from '@church/app-config';
import { event } from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { eq } from 'drizzle-orm';
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
import { ChurchId, MinistryId } from '@/domain/branded-ids';
import { DrizzleEventGroupRepository } from '@/infrastructure/repositories/drizzle-event-group.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { buildScheduleExportApp } from '@/tests/test-support/schedule-export-app';
import {
  EXPORT_CHURCH_A,
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

beforeAll(async () => {
  app = await buildScheduleExportApp({ activeChurchResolver });
});

afterAll(async () => {
  await app.close();
});

let fixture: ScheduleExportFixture;

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: '2026-10-01T12:00:00Z' }) });
  await resetSchedulingPhase3Db();
  fixture = await seedScheduleExport();
  const { userId, volunteerId } = fixture.personas.leader;
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
});

afterEach(() => {
  resetClock();
});

/** Saves Domingos (the Família template) as the Kids Ministry's one group. */
async function saveDomingos() {
  const { template } = await buildEventTemplate({
    db,
    churchId: EXPORT_CHURCH_A,
    name: 'Culto da Família',
    recurrence: { kind: 'weekly', weekdays: [0] },
    blocks: [],
  });
  await db
    .update(event)
    .set({ sourceTemplateId: template.id })
    .where(eq(event.title, 'Culto da Família'));
  await new DrizzleUnitOfWork({ db }).run((tx) =>
    new DrizzleEventGroupRepository({ db }).replaceSetup({
      churchId: ChurchId.from(EXPORT_CHURCH_A),
      ministryId: MinistryId.from(fixture.kidsId),
      groups: [{ name: 'Domingos', templateIds: [template.id] }],
      catchAllName: null,
      tx,
    }),
  );
}

type Split = 'none' | 'group' | 'week' | 'sector' | 'role';

function exportUrl(kind: 'data' | 'file' | 'preview', query: string) {
  return `/api/v1/export/ministries/${fixture.kidsId}/cycles/${fixture.octoberId}/${kind}?${query}`;
}

function get(kind: 'data' | 'file' | 'preview', query: string) {
  return app.inject({
    method: 'GET',
    url: exportUrl(kind, query),
    cookies: { [appConfig.localeCookieName]: 'pt-BR' },
  });
}

interface PartSummary {
  kind: string;
  name: string | null;
  week: { from: string; to: string } | null;
  singleSector: string | null;
  singleRole: string | null;
  events: string[];
}

interface DataPart {
  kind: string;
  name: string | null;
  week: { from: string; to: string } | null;
  singleSector: string | null;
  singleRole: string | null;
  groups: { events: { startDay: string; title: string }[] }[];
}

/** Each part with its Events' start day and title, across its groups. */
async function parts(split: Split): Promise<PartSummary[]> {
  const response = await get('data', `split=${split}`);
  expect(response.statusCode).toBe(200);
  return (response.json().parts as DataPart[]).map(({ groups, ...part }) => ({
    ...part,
    events: groups.flatMap((group) =>
      group.events.map((exported) => `${exported.startDay} ${exported.title}`),
    ),
  }));
}

/** The PDF's text, page by page, whitespace collapsed. */
function pdfPages(pdf: Buffer): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'export-split-test-'));
  const path = join(dir, 'out.pdf');
  writeFileSync(path, pdf);
  return execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
  })
    .split('\f')
    .map((page) => page.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const WHOLE = {
  kind: 'all',
  name: null,
  week: null,
  singleSector: null,
  singleRole: null,
  events: [
    '2026-10-04 Culto da Família',
    '2026-10-07 Culto de Quarta',
    '2026-10-11 Culto da Família',
    '2026-10-14 Culto de Quarta',
    '2026-10-24 Retiro',
  ],
};

describe('Separar in the export data', () => {
  it('keeps one whole part with no split, and with split=none', async () => {
    const response = await get('data', '');
    expect(response.statusCode).toBe(200);
    expect(await parts('none')).toEqual([WHOLE]);
  });

  it('keeps one whole part by group when the Ministry has no Event groups', async () => {
    expect(await parts('group')).toEqual([WHOLE]);
  });

  it('splits by group in the saved order, the catch-all last', async () => {
    await saveDomingos();

    expect(await parts('group')).toEqual([
      {
        kind: 'group',
        name: 'Domingos',
        week: null,
        singleSector: null,
        singleRole: null,
        events: ['2026-10-04 Culto da Família', '2026-10-11 Culto da Família'],
      },
      {
        kind: 'catchAll',
        name: null,
        week: null,
        singleSector: null,
        singleRole: 'Professor',
        events: [
          '2026-10-07 Culto de Quarta',
          '2026-10-14 Culto de Quarta',
          '2026-10-24 Retiro',
        ],
      },
    ]);
  });

  it('splits by Monday-to-Sunday week in date order, each week kept inside the range', async () => {
    const week = (from: string, to: string, events: string[]) => ({
      kind: 'week',
      name: null,
      week: { from, to },
      singleSector: null,
      singleRole: null,
      events,
    });

    expect(await parts('week')).toEqual([
      week('2026-10-01', '2026-10-04', ['2026-10-04 Culto da Família']),
      {
        ...week('2026-10-05', '2026-10-11', [
          '2026-10-07 Culto de Quarta',
          '2026-10-11 Culto da Família',
        ]),
        singleSector: 'Maternal',
        singleRole: 'Professor',
      },
      week('2026-10-12', '2026-10-18', ['2026-10-14 Culto de Quarta']),
      {
        ...week('2026-10-19', '2026-10-25', ['2026-10-24 Retiro']),
        singleSector: 'Berçário',
        singleRole: 'Professor',
      },
    ]);
  });

  it('splits by Sector alphabetically, each part holding only its Sector', async () => {
    const response = await get('data', 'split=sector');
    const [bercario, maternal] = response.json().parts;

    expect(await parts('sector')).toEqual([
      {
        kind: 'sector',
        name: 'Berçário',
        week: null,
        singleSector: 'Berçário',
        singleRole: null,
        events: ['2026-10-04 Culto da Família', '2026-10-24 Retiro'],
      },
      {
        kind: 'sector',
        name: 'Maternal',
        week: null,
        singleSector: 'Maternal',
        singleRole: 'Professor',
        // The cancelled Sunday had a Maternal spot.
        events: [
          '2026-10-04 Culto da Família',
          '2026-10-07 Culto de Quarta',
          '2026-10-11 Culto da Família',
        ],
      },
    ]);
    expect(bercario.groups[0].events[0].timeBlocks[0].shifts).toEqual([
      {
        label: 'Turno 1',
        day: null,
        startTime: '09:00',
        endTime: '10:30',
        sectors: [
          {
            name: 'Berçário',
            paletteIndex: 1,
            people: [
              { name: 'Ana Souza', role: 'Auxiliar' },
              { name: 'Carla Dias', role: 'Professor' },
            ],
          },
        ],
      },
      {
        label: 'Turno 2',
        day: null,
        startTime: '10:30',
        endTime: '12:00',
        sectors: [
          {
            name: 'Berçário',
            paletteIndex: 1,
            people: [{ name: 'Ána  Souza', role: 'Professor' }],
          },
        ],
      },
    ]);
    expect(maternal.groups[0].events[2]).toEqual({
      startDay: '2026-10-11',
      endDay: '2026-10-11',
      title: 'Culto da Família',
      cancelled: true,
      timeBlocks: [],
    });
  });

  it('splits by Role alphabetically, each part holding only its Role', async () => {
    const response = await get('data', 'split=role');
    const [auxiliar] = response.json().parts;

    expect(await parts('role')).toEqual([
      {
        kind: 'role',
        name: 'Auxiliar',
        week: null,
        singleSector: 'Berçário',
        singleRole: 'Auxiliar',
        events: ['2026-10-04 Culto da Família'],
      },
      {
        kind: 'role',
        name: 'Professor',
        week: null,
        singleSector: null,
        singleRole: 'Professor',
        events: [
          '2026-10-04 Culto da Família',
          '2026-10-07 Culto de Quarta',
          '2026-10-11 Culto da Família',
          '2026-10-24 Retiro',
        ],
      },
    ]);
    expect(auxiliar.groups[0].events[0].timeBlocks[0].shifts).toEqual([
      {
        label: 'Turno 1',
        day: null,
        startTime: '09:00',
        endTime: '10:30',
        sectors: [
          {
            name: 'Berçário',
            paletteIndex: 1,
            people: [{ name: 'Ana Souza', role: 'Auxiliar' }],
          },
        ],
      },
    ]);
  });

  it('refuses a split it does not know', async () => {
    expect((await get('data', 'split=month')).statusCode).toBe(422);
  });
});

describe('Separar in the files', () => {
  it('starts each part of the PDF on a new page under its name and single line', async () => {
    const response = await get('file', 'format=pdf&split=sector');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain(
      `filename="Escala - Kids - Outubro 2026.pdf"`,
    );
    const pages = pdfPages(response.rawPayload);
    expect(pages).toHaveLength(2);
    const [bercario = '', maternal = ''] = pages;
    expect(bercario).toMatch(/^Escala Kids Outubro 2026 Berçário /);
    expect(bercario).toContain('Todos servem em Berçário');
    expect(bercario).toContain('Carla Dias (Professor)');
    expect(bercario).not.toContain('Bruno Lima');
    expect(maternal).toMatch(/^Escala Kids Outubro 2026 Maternal /);
    expect(maternal).toContain('Todos servem como Professor em Maternal');
    // The single Role is stated once, never after each name.
    expect(maternal).toContain('Bruno Lima');
    expect(maternal).not.toContain('(Professor)');
    expect(maternal).not.toContain('Carla Dias');
    // The single Sector is dropped from the list table.
    expect(maternal).not.toContain('Setor');
  });

  it('names each week part in the PDF', async () => {
    const pages = pdfPages(
      (await get('file', 'format=pdf&split=week')).rawPayload,
    );

    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain('Semana 01–04 out');
    expect(pages[3]).toContain('Semana 19–25 out');
  });

  it('downloads one PNG per part, named after it, and 404 past the last part', async () => {
    const first = await get('file', 'format=png&split=sector&part=1');
    const second = await get('file', 'format=png&split=sector&part=2');
    const past = await get('file', 'format=png&split=sector&part=3');

    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(first.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Escala - Kids - Outubro 2026 - Berçário.png')}`,
    );
    expect(second.headers['content-disposition']).toContain(
      `filename="Escala - Kids - Outubro 2026 - Maternal.png"`,
    );
    expect(Buffer.compare(first.rawPayload, second.rawPayload)).not.toBe(0);
    expect(past.statusCode).toBe(404);
  });

  it('names a week PNG after its week and the catch-all after its default name', async () => {
    const week = await get('file', 'format=png&split=week&part=2');
    expect(week.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Escala - Kids - Outubro 2026 - Semana 05–11 out.png')}`,
    );
    await saveDomingos();
    const catchAll = await get('file', 'format=png&split=group&part=2');
    expect(catchAll.headers['content-disposition']).toContain(
      `filename="Escala - Kids - Outubro 2026 - Outros.png"`,
    );
  });

  it('keeps an unsplit PNG unsuffixed', async () => {
    const response = await get('file', 'format=png&split=none&part=1');

    expect(response.headers['content-disposition']).toContain(
      `filename="Escala - Kids - Outubro 2026.png"`,
    );
    expect((await get('file', 'format=png&part=2')).statusCode).toBe(404);
  });

  it('previews each part: the PDF pages across parts, each table image by part', async () => {
    const pdfPage = (page: number) =>
      get('preview', `format=pdf&split=sector&page=${page}`);
    const pngPart = (part: number) =>
      get('preview', `format=png&split=sector&part=${part}&page=1`);

    expect((await pdfPage(2)).statusCode).toBe(200);
    expect((await pdfPage(3)).statusCode).toBe(404);
    const maternal = await pngPart(2);
    expect(maternal.statusCode).toBe(200);
    expect(maternal.headers['content-type']).toBe('image/svg+xml');
    expect(maternal.body).not.toBe((await pngPart(1)).body);
    expect((await pngPart(3)).statusCode).toBe(404);
  });
});
