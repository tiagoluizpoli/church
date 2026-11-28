import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appConfig } from '@church/app-config';
import {
  cycle,
  event,
  eventTimeBlock,
  ministryParticipation,
  user,
} from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { eq, inArray } from 'drizzle-orm';
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
import { ScheduleExportController } from '@/api/controllers/schedule-export-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbScheduleChangeReader } from '@/application/db-schedule-change-reader';
import { DbScheduleExportReader } from '@/application/db-schedule-export-reader';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import {
  DrizzleAssignmentRepository,
  DrizzleMinistryParticipationRepository,
  DrizzlePlanningEventRepository,
  DrizzleRoleRepository,
  DrizzleShiftRepository,
} from '@/infrastructure/repositories';
import { DrizzleEventGroupRepository } from '@/infrastructure/repositories/drizzle-event-group.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleScheduleExportRepository } from '@/infrastructure/repositories/drizzle-schedule-export.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { TypstCliRenderer } from '@/infrastructure/typst/typst-cli-renderer';
import {
  TYPST_BINARY,
  TYPST_FONTS_DIR,
  TYPST_TEMPLATES_DIR,
} from '@/infrastructure/typst/typst-paths';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';
import {
  EXPORT_CHURCH_A,
  type ExportPersona,
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
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db,
  });
  const controller = new ScheduleExportController({
    scheduleExportReader: new DbScheduleExportReader({
      scheduleExportRepository: new DrizzleScheduleExportRepository({ db }),
      eventGroupRepository: new DrizzleEventGroupRepository({ db }),
      scheduleChangeReader: new DbScheduleChangeReader({
        assignmentRepository: new DrizzleAssignmentRepository({ db }),
        eventRepository: new DrizzlePlanningEventRepository({ db }),
        participationRepository,
        roleRepository: new DrizzleRoleRepository({ db }),
        shiftRepository: new DrizzleShiftRepository({ db }),
      }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      typstRenderer: new TypstCliRenderer({
        objectStorage: new InMemoryObjectStorage(),
        config: {
          binary: TYPST_BINARY,
          fontsDir: TYPST_FONTS_DIR,
          templatesDir: TYPST_TEMPLATES_DIR,
          timeoutMs: 10_000,
          cacheBytes: 10 * 1024 * 1024,
          concurrency: 2,
        },
      }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository,
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

let fixture: ScheduleExportFixture;

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: '2026-10-01T12:00:00Z' }) });
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

interface ExportRequest {
  ministryId?: string;
  cycleId?: string;
  locale?: 'en' | 'pt-BR';
}

function exportUrl(
  kind: 'data' | 'file' | 'preview',
  request: ExportRequest = {},
) {
  const ministryId = request.ministryId ?? fixture.kidsId;
  const cycleId = request.cycleId ?? fixture.octoberId;
  return `/api/v1/export/ministries/${ministryId}/cycles/${cycleId}/${kind}`;
}

function readData(request: ExportRequest = {}) {
  return app.inject({ method: 'GET', url: exportUrl('data', request) });
}

function readPdf(request: ExportRequest = {}) {
  return app.inject({
    method: 'GET',
    url: `${exportUrl('file', request)}?format=pdf`,
    cookies: { [appConfig.localeCookieName]: request.locale ?? 'pt-BR' },
  });
}

interface PreviewRequest extends ExportRequest {
  format?: 'pdf' | 'png';
  page?: number;
}

function readPng(request: ExportRequest = {}) {
  return app.inject({
    method: 'GET',
    url: `${exportUrl('file', request)}?format=png`,
  });
}

function readPreview({
  format = 'pdf',
  page = 1,
  ...request
}: PreviewRequest = {}) {
  return app.inject({
    method: 'GET',
    url: `${exportUrl('preview', request)}?format=${format}&page=${page}`,
  });
}

/** An SVG page's size in points, from its root element. */
function svgSize(svg: string) {
  const [, width, height] =
    /^<svg viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
  return { width: Number(width), height: Number(height) };
}

/** A PNG's size in pixels, from its IHDR chunk. */
function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function poppler(tool: 'pdftotext' | 'pdffonts' | 'pdfinfo', pdf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'export-test-'));
  const path = join(dir, 'out.pdf');
  writeFileSync(path, pdf);
  const args = tool === 'pdftotext' ? ['-layout', path, '-'] : [path];
  return execFileSync(tool, args, { encoding: 'utf8' });
}

const BERCARIO = 'Berçário';
const MATERNAL = 'Maternal';

/** The October tree with every hidden cancelled scope left out. */
const OCTOBER_EVENTS = [
  {
    startDay: '2026-10-04',
    endDay: '2026-10-04',
    title: 'Culto da Família',
    cancelled: false,
    timeBlocks: [
      {
        label: 'Manhã',
        cancelled: false,
        shifts: [
          {
            label: 'Turno 1',
            day: null,
            startTime: '09:00',
            endTime: '10:30',
            sectors: [
              {
                name: BERCARIO,
                paletteIndex: 1,
                people: [
                  { name: 'Ana Souza', role: 'Auxiliar' },
                  { name: 'Carla Dias', role: 'Professor' },
                ],
              },
              {
                name: MATERNAL,
                paletteIndex: 2,
                people: [{ name: 'Bruno Lima', role: 'Professor' }],
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
                name: BERCARIO,
                paletteIndex: 1,
                people: [{ name: 'Ána  Souza', role: 'Professor' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    startDay: '2026-10-07',
    endDay: '2026-10-07',
    title: 'Culto de Quarta',
    cancelled: false,
    timeBlocks: [
      {
        label: null,
        cancelled: false,
        shifts: [
          {
            label: null,
            day: null,
            startTime: '19:30',
            endTime: '21:00',
            sectors: [
              {
                name: MATERNAL,
                paletteIndex: 2,
                people: [{ name: 'Bruno Lima', role: 'Professor' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    startDay: '2026-10-11',
    endDay: '2026-10-11',
    title: 'Culto da Família',
    cancelled: true,
    timeBlocks: [],
  },
  {
    startDay: '2026-10-14',
    endDay: '2026-10-14',
    title: 'Culto de Quarta',
    cancelled: false,
    timeBlocks: [{ label: 'Louvor', cancelled: true, shifts: [] }],
  },
  {
    startDay: '2026-10-24',
    endDay: '2026-10-25',
    title: 'Retiro',
    cancelled: false,
    timeBlocks: [
      {
        label: 'Retiro',
        cancelled: false,
        shifts: ['2026-10-24', '2026-10-25'].map((day) => ({
          label: null,
          day,
          startTime: '08:00',
          endTime: '12:00',
          sectors: [
            {
              name: BERCARIO,
              paletteIndex: 1,
              people: [{ name: 'Carla Dias', role: 'Professor' }],
            },
          ],
        })),
      },
    ],
  },
];

describe('GET /export/ministries/:ministryId/cycles/:cycleId/data', () => {
  it.each([
    ['admin', 200],
    ['leader', 200],
    ['volunteer', 403],
    ['member', 403],
    ['otherLeader', 404],
  ] as const)('answers %s with %i', async (persona, status) => {
    signIn(persona);
    expect((await readData()).statusCode).toBe(status);
    expect((await readPdf()).statusCode).toBe(status);
    expect((await readPng()).statusCode).toBe(status);
    expect((await readPreview()).statusCode).toBe(status);
  });

  it('refuses a Ministry or Cycle of another Church, and a Cycle with no Schedule, as 404', async () => {
    signIn('admin');
    for (const request of [
      { ministryId: fixture.foreignMinistryId },
      { cycleId: fixture.foreignCycleId },
      { cycleId: fixture.decemberId },
    ]) {
      expect((await readData(request)).statusCode).toBe(404);
      expect((await readPdf(request)).statusCode).toBe(404);
      expect((await readPreview(request)).statusCode).toBe(404);
    }
  });

  it('reads the whole Cycle as one ordered tree of facts in Church time', async () => {
    const response = await readData();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ministry: { name: 'Kids' },
      cycle: {
        name: 'Outubro 2026',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
      range: { from: '2026-10-01', to: '2026-10-31' },
      isDraft: false,
      hasUnsentChanges: true,
      singleSector: null,
      singleRole: null,
      duplicateNames: [['Ana Souza', 'Ána  Souza']],
      parts: [
        {
          kind: 'all',
          name: null,
          week: null,
          singleSector: null,
          singleRole: null,
          groups: [{ kind: 'list', name: null, events: OCTOBER_EVENTS }],
        },
      ],
    });
  });

  it('brings a hidden cancelled Event and block back once shown again', async () => {
    await db
      .update(event)
      .set({ isHidden: false })
      .where(eq(event.id, fixture.hiddenSundayId));
    await db
      .update(eventTimeBlock)
      .set({ isHidden: false })
      .where(eq(eventTimeBlock.id, fixture.hiddenBlockId));

    const { events } = (await readData()).json().parts[0].groups[0];

    expect(events).toEqual([
      ...OCTOBER_EVENTS.slice(0, 3),
      {
        ...OCTOBER_EVENTS[3],
        timeBlocks: [
          { label: 'Louvor', cancelled: true, shifts: [] },
          { label: 'Palavra', cancelled: true, shifts: [] },
        ],
      },
      {
        startDay: '2026-10-18',
        endDay: '2026-10-18',
        title: 'Culto da Família',
        cancelled: true,
        timeBlocks: [],
      },
      OCTOBER_EVENTS[4],
    ]);
  });

  it('marks a never-published Schedule as a draft with its empty spots', async () => {
    await db
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(inArray(ministryParticipation.id, fixture.participationIds));

    const body = (await readData()).json();

    expect(body.isDraft).toBe(true);
    expect(body.hasUnsentChanges).toBe(false);
    expect(
      body.parts[0].groups[0].events[0].timeBlocks[0].shifts[0].sectors[0],
    ).toEqual({
      name: BERCARIO,
      paletteIndex: 1,
      people: [
        { name: 'Ana Souza', role: 'Auxiliar' },
        { name: null, role: 'Auxiliar' },
        { name: 'Carla Dias', role: 'Professor' },
      ],
    });
  });

  it('is no draft once any Event of the Cycle was published, and shows no empty spots', async () => {
    const [published, ...rest] = fixture.participationIds;
    await db
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(inArray(ministryParticipation.id, rest));

    const body = (await readData()).json();

    expect(published).toBeDefined();
    expect(body.isDraft).toBe(false);
    expect(body.parts[0].groups[0].events).toEqual(OCTOBER_EVENTS);
  });

  it('flags names that clash ignoring case, accents and extra spaces', async () => {
    await db
      .update(user)
      .set({ name: ' ANA souza ' })
      .where(eq(user.name, 'Bruno Lima'));

    const body = (await readData()).json();

    expect(body.duplicateNames).toEqual([
      [' ANA souza ', 'Ana Souza', 'Ána  Souza'],
    ]);
  });

  it('states a whole-export single Sector and Role once', async () => {
    const body = (await readData({ cycleId: fixture.novemberId })).json();

    expect(body).toMatchObject({
      singleSector: BERCARIO,
      singleRole: 'Professor',
      duplicateNames: [],
      parts: [{ name: null, singleSector: BERCARIO, singleRole: 'Professor' }],
    });
  });
});

describe('GET /export/ministries/:ministryId/cycles/:cycleId/file', () => {
  it('downloads an A4 landscape text PDF of the whole Cycle', async () => {
    const response = await readPdf();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Escala - Kids - Outubro 2026.pdf"; filename*=UTF-8''Escala%20-%20Kids%20-%20Outubro%202026.pdf`,
    );
    const pdf = response.rawPayload;
    expect(poppler('pdfinfo', pdf)).toMatch(
      /Page size:\s+841\.89 x 595\.276 pts \(A4\)/,
    );
    expect(poppler('pdffonts', pdf)).toMatch(/AtkinsonHyperlegible-Regular/);
    const text = poppler('pdftotext', pdf).replace(/\s+/g, ' ');
    for (const expected of [
      'Escala',
      'Kids',
      'Outubro 2026',
      '01/10/2026 – 31/10/2026',
      'Culto da Família · Manhã',
      'Turno 1 · 09h00–10h30',
      'Berçário',
      'Ana Souza (Auxiliar)',
      'Carla Dias (Professor)',
      'Ána Souza',
      '19h30–21h00',
      'Não haverá culto',
      'Louvor',
      'Cancelado',
      'sáb 24 out · 08h00–12h00',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('Davi Rocha');
    expect(text).not.toContain('Ensaio');
    expect(text).not.toContain('Palavra');
    expect(text).not.toContain('Rascunho');
  });

  it('writes the fixed text in the locale-cookie language', async () => {
    const text = poppler(
      'pdftotext',
      (await readPdf({ locale: 'en' })).rawPayload,
    ).replace(/\s+/g, ' ');

    expect(text).toContain('Schedule');
    expect(text).toContain('No service');
    expect(text).toContain('Cancelled');
    expect(text).toContain('19:30–21:00');
  });

  it('tags a draft and states a single Sector and Role under the title', async () => {
    await db
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(inArray(ministryParticipation.id, fixture.participationIds));

    const draft = poppler('pdftotext', (await readPdf()).rawPayload);
    const single = poppler(
      'pdftotext',
      (await readPdf({ cycleId: fixture.novemberId })).rawPayload,
    );

    expect(draft).toContain('Rascunho');
    expect(draft).toContain('Vaga');
    expect(single.replace(/\s+/g, ' ')).toContain(
      'Todos servem como Professor em Berçário',
    );
  });

  it('suffixes a draft file name with Rascunho, in the locale', async () => {
    await db
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(inArray(ministryParticipation.id, fixture.participationIds));

    const pt = await readPdf();
    const en = await readPdf({ locale: 'en' });

    expect(pt.headers['content-disposition']).toContain(
      'filename="Escala - Kids - Outubro 2026 - Rascunho.pdf"',
    );
    expect(en.headers['content-disposition']).toContain(
      'filename="Schedule - Kids - Outubro 2026 - Draft.pdf"',
    );
  });

  it('exports a published Schedule with unsent changes as it stands, unstamped', async () => {
    const data = (await readData()).json();
    const text = poppler('pdftotext', (await readPdf()).rawPayload).replace(
      /\s+/g,
      ' ',
    );

    expect(data).toMatchObject({ isDraft: false, hasUnsentChanges: true });
    // Ána Souza's Assignment was made after publishing and not sent yet.
    expect(text).toContain('Ána Souza (Professor)');
    expect(text).not.toContain('Rascunho');
    expect(text).not.toContain('Vaga');
  });

  it('prints clashing names exactly as registered', async () => {
    // pdftotext reads Typst's two spaces as one; the accent shows nothing was folded.
    const text = poppler('pdftotext', (await readPdf()).rawPayload);

    expect(text).toContain('Ána Souza (Professor)');
    expect(text).toContain('Ana Souza (Auxiliar)');
  });

  it('returns byte-identical files for identical requests', async () => {
    const first = (await readPdf()).rawPayload;
    const second = (await readPdf()).rawPayload;

    expect(Buffer.compare(first, second)).toBe(0);
  });

  it('removes banned characters from the file name', async () => {
    await db
      .update(cycle)
      .set({ name: 'Out: 2026/27?' })
      .where(eq(cycle.id, fixture.octoberId));

    const response = await readPdf({ locale: 'en' });

    expect(response.headers['content-disposition']).toContain(
      'filename="Schedule - Kids - Out 202627.pdf"',
    );
  });

  it('downloads the whole grid as one PNG, never cut by size', async () => {
    const response = await readPng();
    const preview = svgSize((await readPreview({ format: 'png' })).body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Escala - Kids - Outubro 2026.png"; filename*=UTF-8''Escala%20-%20Kids%20-%20Outubro%202026.png`,
    );
    // A4 landscape width at 200 ppi; the height is the whole grid's.
    const png = pngSize(response.rawPayload);
    expect(png.width).toBe(2339);
    expect(png.height).toBe(Math.ceil((preview.height * 200) / 72));
    expect((await readPreview({ format: 'png', page: 2 })).statusCode).toBe(
      404,
    );
  });

  it('refuses a format it cannot render', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${exportUrl('file')}?format=docx`,
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('GET /export/ministries/:ministryId/cycles/:cycleId/preview', () => {
  it('previews each PDF page as an SVG page of the same template', async () => {
    const pages = Number(
      /Pages:\s+(\d+)/.exec(
        poppler('pdfinfo', (await readPdf()).rawPayload),
      )?.[1],
    );

    for (let page = 1; page <= pages; page += 1) {
      const response = await readPreview({ page });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/svg+xml');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(svgSize(response.body)).toEqual({
        width: 841.88976378,
        height: 595.275590551,
      });
    }
    expect((await readPreview({ page: pages + 1 })).statusCode).toBe(404);
  });

  it('previews the table image as one page of the whole grid', async () => {
    const pdf = svgSize((await readPreview()).body);
    const image = svgSize((await readPreview({ format: 'png' })).body);

    expect(image.width).toBe(pdf.width);
    expect(image.height).not.toBe(pdf.height);
  });

  it('refuses a page or format it cannot preview', async () => {
    for (const query of ['format=pdf&page=0', 'format=docx&page=1']) {
      const response = await app.inject({
        method: 'GET',
        url: `${exportUrl('preview')}?${query}`,
      });
      expect(response.statusCode).toBe(422);
    }
  });
});
