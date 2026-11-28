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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { EventGroupController } from '@/api/controllers/event-group-controller';
import { ScheduleExportController } from '@/api/controllers/schedule-export-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbEventGroupManager } from '@/application/db-event-group-manager';
import { DbScheduleChangeReader } from '@/application/db-schedule-change-reader';
import { DbScheduleExportReader } from '@/application/db-schedule-export-reader';
import { ChurchId, EventTemplateId } from '@/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import {
  DrizzleAssignmentRepository,
  DrizzleMinistryParticipationRepository,
  DrizzlePlanningEventRepository,
  DrizzleRoleRepository,
  DrizzleShiftRepository,
} from '@/infrastructure/repositories';
import { DrizzleEventGroupRepository } from '@/infrastructure/repositories/drizzle-event-group.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
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
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';
import {
  EXPORT_CHURCH_A,
  EXPORT_CHURCH_B,
  type ExportPersona,
  type ScheduleExportFixture,
  seedScheduleExport,
  seedTallBands,
} from '@/tests/test-support/schedule-export-fixture';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const db = schedulingTestDb;
const activeChurchResolver = { resolve: vi.fn() };
const eventTemplateRepository = new DrizzleEventTemplateRepository({ db });

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const eventGroupRepository = new DrizzleEventGroupRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const authorityGuard = new AuthorityGuard({
    manager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: {} as never,
      eventRepository: {} as never,
      eventTimeBlockRepository: {} as never,
      ministryRepository,
    }),
  });
  const groups = new EventGroupController({
    eventGroupManager: new DbEventGroupManager({
      eventGroupRepository,
      unitOfWork,
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard,
  });
  const exports = new ScheduleExportController({
    scheduleExportReader: new DbScheduleExportReader({
      scheduleExportRepository: new DrizzleScheduleExportRepository({ db }),
      eventGroupRepository,
      scheduleChangeReader: new DbScheduleChangeReader({
        assignmentRepository: new DrizzleAssignmentRepository({ db }),
        eventRepository: new DrizzlePlanningEventRepository({ db }),
        participationRepository: new DrizzleMinistryParticipationRepository({
          db,
        }),
        roleRepository: new DrizzleRoleRepository({ db }),
        shiftRepository: new DrizzleShiftRepository({ db }),
      }),
      unitOfWork,
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
    authorityGuard,
  });
  await app.register(
    async (instance) => {
      for (const controller of [groups, exports]) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
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

let fixture: ScheduleExportFixture;
let templates: Record<'familia' | 'quarta' | 'ensaio' | 'ceia', string>;

/** Church templates; the fixture's Events link to Família and Quarta by title. */
async function seedTemplates() {
  const build = async (name: string) =>
    (
      await buildEventTemplate({
        db,
        churchId: EXPORT_CHURCH_A,
        name,
        recurrence: { kind: 'weekly', weekdays: [0] },
        blocks: [],
      })
    ).template.id;
  const familia = await build('Culto da Família');
  const quarta = await build('Culto de Quarta');
  const ensaio = await build('Ensaio');
  const ceia = await build('Santa Ceia');
  for (const [title, id] of [
    ['Culto da Família', familia],
    ['Culto de Quarta', quarta],
  ] as const) {
    await db
      .update(event)
      .set({ sourceTemplateId: id })
      .where(eq(event.title, title));
  }
  return { familia, quarta, ensaio, ceia };
}

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: '2026-10-01T12:00:00Z' }) });
  await resetSchedulingPhase3Db();
  fixture = await seedScheduleExport();
  templates = await seedTemplates();
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

interface SavedGroup {
  name: string;
  templateIds: string[];
}

interface SaveInput {
  groups: SavedGroup[];
  catchAllName?: string | null;
  ministryId?: string;
}

function groupsUrl(ministryId = fixture.kidsId) {
  return `/api/v1/ministries/${ministryId}/event-groups`;
}

function readGroups(ministryId?: string) {
  return app.inject({ method: 'GET', url: groupsUrl(ministryId) });
}

function saveGroups({ groups, catchAllName = null, ministryId }: SaveInput) {
  return app.inject({
    method: 'PUT',
    url: groupsUrl(ministryId),
    payload: { groups, catchAllName },
  });
}

function readExport(cycleId = fixture.octoberId) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${cycleId}/data`,
  });
}

interface ExportEventSummary {
  startDay: string;
  title: string;
}

interface ExportGroupSummary {
  kind: string;
  name: string | null;
  events: ExportEventSummary[];
}

/** Each group of the one part with its Events' day and title. */
async function exportedGroups(cycleId?: string) {
  const response = await readExport(cycleId);
  expect(response.statusCode).toBe(200);
  const [part] = response.json().parts as { groups: ExportGroupSummary[] }[];
  return part?.groups.map((group) => ({
    kind: group.kind,
    name: group.name,
    events: group.events.map(
      (exported) => `${exported.startDay} ${exported.title}`,
    ),
  }));
}

const TEMPLATE_LIST = () => [
  { id: templates.familia, name: 'Culto da Família' },
  { id: templates.quarta, name: 'Culto de Quarta' },
  { id: templates.ensaio, name: 'Ensaio' },
  { id: templates.ceia, name: 'Santa Ceia' },
];

describe('Event groups of a Ministry', () => {
  it('lets the Ministry leader and a ChurchAdmin read them', async () => {
    for (const persona of ['leader', 'admin'] as const) {
      signIn(persona);
      const response = await readGroups();
      expect(response.statusCode).toBe(200);
    }
  });

  it('refuses a volunteer and a plain member, then another Ministry and Church', async () => {
    for (const persona of ['volunteer', 'member'] as const) {
      signIn(persona);
      expect((await readGroups()).statusCode).toBe(403);
      expect((await saveGroups({ groups: [] })).statusCode).toBe(403);
    }
    signIn('otherLeader');
    expect((await readGroups()).statusCode).toBe(404);
    expect((await saveGroups({ groups: [] })).statusCode).toBe(404);
    signIn('admin');
    expect((await readGroups(fixture.foreignMinistryId)).statusCode).toBe(404);
  });

  it('starts as one plain list, offering every Church template', async () => {
    const response = await readGroups();
    expect(response.json()).toEqual({
      groups: [],
      catchAllName: null,
      templates: TEMPLATE_LIST(),
    });
  });

  it('saves and reads back the whole ordered list and the catch-all name', async () => {
    const saved = await saveGroups({
      groups: [
        { name: 'Quartas', templateIds: [templates.quarta] },
        { name: 'Domingos', templateIds: [templates.ceia, templates.familia] },
      ],
      catchAllName: 'Especiais',
    });
    expect(saved.statusCode).toBe(200);
    const expected = {
      groups: [
        {
          name: 'Quartas',
          templates: [{ id: templates.quarta, name: 'Culto de Quarta' }],
        },
        {
          name: 'Domingos',
          templates: [
            { id: templates.ceia, name: 'Santa Ceia' },
            { id: templates.familia, name: 'Culto da Família' },
          ],
        },
      ],
      catchAllName: 'Especiais',
      templates: TEMPLATE_LIST(),
    };
    expect(saved.json()).toEqual(expected);
    expect((await readGroups()).json()).toEqual(expected);
  });

  it('keeps the last save, and an empty list returns to one plain list', async () => {
    await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [templates.familia] },
        { name: 'Quartas', templateIds: [templates.quarta] },
      ],
      catchAllName: 'Especiais',
    });
    signIn('admin');
    await saveGroups({
      groups: [{ name: 'Quartas e mais', templateIds: [templates.quarta] }],
    });
    expect((await readGroups()).json()).toMatchObject({
      groups: [
        {
          name: 'Quartas e mais',
          templates: [{ id: templates.quarta, name: 'Culto de Quarta' }],
        },
      ],
      catchAllName: null,
    });
    await saveGroups({ groups: [] });
    expect((await readGroups()).json()).toMatchObject({ groups: [] });
  });

  it('moves a template to its new group, never holding it twice', async () => {
    await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [templates.familia] },
        { name: 'Quartas', templateIds: [templates.quarta] },
      ],
    });
    await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [] },
        { name: 'Quartas', templateIds: [templates.quarta, templates.familia] },
      ],
    });
    expect((await readGroups()).json().groups).toEqual([
      { name: 'Domingos', templates: [] },
      {
        name: 'Quartas',
        templates: [
          { id: templates.quarta, name: 'Culto de Quarta' },
          { id: templates.familia, name: 'Culto da Família' },
        ],
      },
    ]);
    const twice = await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [templates.familia] },
        { name: 'Quartas', templateIds: [templates.familia] },
      ],
    });
    expect(twice.statusCode).toBe(422);
  });

  it('refuses a blank group name and a template of another Church', async () => {
    const blank = await saveGroups({
      groups: [{ name: '  ', templateIds: [] }],
    });
    expect(blank.statusCode).toBe(422);
    const foreign = (
      await buildEventTemplate({
        db,
        churchId: EXPORT_CHURCH_B,
        name: 'Foreign',
        recurrence: { kind: 'weekly', weekdays: [0] },
        blocks: [],
      })
    ).template.id;
    const refused = await saveGroups({
      groups: [{ name: 'Domingos', templateIds: [foreign] }],
    });
    expect(refused.statusCode).toBe(404);
    expect((await readGroups()).json().groups).toEqual([]);
  });

  it('drops a deleted template from its group', async () => {
    await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [templates.familia, templates.ceia] },
      ],
    });
    await eventTemplateRepository.delete({
      churchId: ChurchId.from(EXPORT_CHURCH_A),
      templateId: EventTemplateId.from(templates.familia),
    });
    expect((await readGroups()).json().groups).toEqual([
      {
        name: 'Domingos',
        templates: [{ id: templates.ceia, name: 'Santa Ceia' }],
      },
    ]);
  });
});

describe('Event groups in the export', () => {
  it('exports one plain list in date order without groups', async () => {
    expect(await exportedGroups()).toEqual([
      {
        kind: 'list',
        name: null,
        events: [
          '2026-10-04 Culto da Família',
          '2026-10-07 Culto de Quarta',
          '2026-10-11 Culto da Família',
          '2026-10-14 Culto de Quarta',
          '2026-10-24 Retiro',
        ],
      },
    ]);
  });

  it('exports each group in order, the catch-all last, empty groups left out', async () => {
    await saveGroups({
      groups: [
        { name: 'Ensaios', templateIds: [templates.ensaio] },
        { name: 'Domingos', templateIds: [templates.familia] },
      ],
    });
    expect(await exportedGroups()).toEqual([
      {
        kind: 'group',
        name: 'Domingos',
        events: ['2026-10-04 Culto da Família', '2026-10-11 Culto da Família'],
      },
      {
        kind: 'catchAll',
        name: null,
        events: [
          '2026-10-07 Culto de Quarta',
          '2026-10-14 Culto de Quarta',
          '2026-10-24 Retiro',
        ],
      },
    ]);
  });

  it('names the catch-all as renamed and leaves it out when every Event is grouped', async () => {
    await saveGroups({
      groups: [
        { name: 'Domingos', templateIds: [templates.familia] },
        { name: 'Quartas', templateIds: [templates.quarta] },
      ],
      catchAllName: 'Especiais',
    });
    const groups = await exportedGroups();
    expect(groups?.map((group) => [group.kind, group.name])).toEqual([
      ['group', 'Domingos'],
      ['group', 'Quartas'],
      ['catchAll', 'Especiais'],
    ]);
    await db
      .update(event)
      .set({ sourceTemplateId: templates.familia })
      .where(eq(event.title, 'Retiro'));
    expect(
      (await exportedGroups())?.map((group) => [group.kind, group.name]),
    ).toEqual([
      ['group', 'Domingos'],
      ['group', 'Quartas'],
    ]);
  });

  it("sends a deleted template's Events to the catch-all, older Cycles included", async () => {
    await saveGroups({
      groups: [{ name: 'Domingos', templateIds: [templates.familia] }],
    });
    expect((await exportedGroups(fixture.novemberId))?.[0]?.kind).toBe('group');
    await eventTemplateRepository.delete({
      churchId: ChurchId.from(EXPORT_CHURCH_A),
      templateId: EventTemplateId.from(templates.familia),
    });
    for (const cycleId of [fixture.octoberId, fixture.novemberId]) {
      const groups = await exportedGroups(cycleId);
      expect(groups?.map((group) => group.kind)).toEqual(['catchAll']);
    }
  });

  it('prints one table per group under its bar, the catch-all as the list table', async () => {
    await saveGroups({
      groups: [{ name: 'Domingos', templateIds: [templates.familia] }],
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${fixture.octoberId}/file?format=pdf`,
      cookies: { [appConfig.localeCookieName]: 'pt-BR' },
    });
    expect(response.statusCode).toBe(200);
    const text = pdfText(response.rawPayload);
    // The group bar names the group and its shared Event title once.
    expect(text).toContain('Domingos Culto da Família');
    expect(text.match(/Culto da Família/g)).toHaveLength(1);
    // Dates are the group table's columns: weekdays over the days.
    expect(text).toContain('dom dom 4 out 11 out');
    expect(text).toContain('Não haverá culto');
    // The catch-all, by its default name, is the list table.
    expect(text).toContain('Outros');
    expect(text).toContain('Data Evento Horário Setor Quem serve');
    expect(text).toContain('Culto de Quarta');
    expect(text).toContain('Retiro');
  });

  it('breaks tall bands only between Sector rows, repeating the header, bar and labels', async () => {
    const { cycleId } = await seedTallBands({
      ministryId: fixture.kidsId,
      sundayTemplateId: templates.familia,
    });
    await saveGroups({
      groups: [{ name: 'Domingos', templateIds: [templates.familia] }],
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${cycleId}/file?format=pdf`,
      cookies: { [appConfig.localeCookieName]: 'pt-BR' },
    });
    expect(response.statusCode).toBe(200);
    const pages = pdfPages(response.rawPayload);
    expect(pages).toHaveLength(4);
    // Manhã fits under the header; Tarde then fits only on a fresh page and
    // moves there whole, under the repeated bar and date header.
    expect(pages[0]).toContain('Manhã Sala 1 Voluntário 01 Conceição');
    expect(pages[0]).not.toContain('Tarde');
    expect(pages[1]).toMatch(
      /^Domingos Culto da Família dom 7 fev Tarde Sala 1 Voluntário 01 Conceição 14h00–17h00 /,
    );
    // Noite is taller than a page: it breaks after Sala 2's last person, and
    // the next page repeats the bar, the date header and the time label as is.
    expect(pages[1]).toMatch(
      /Sala 2 Voluntário 09 Conceição .*Voluntário 16 Conceição$/,
    );
    expect(pages[2]).toMatch(
      /^Domingos Culto da Família dom 7 fev Noite Sala 3 Voluntário 17 Conceição 18h00–21h00 /,
    );
    // The catch-all list table breaks the same way and repeats Data · Evento · Horário.
    expect(pages[2]).toMatch(
      /Outros Data Evento Horário Setor Quem serve sáb 13 fev Retiro 08h00–12h00 Sala 1 .*Voluntário 08 Conceição$/,
    );
    expect(pages[3]).toMatch(
      /^Outros Data Evento Horário Setor Quem serve sáb 13 fev Retiro 08h00–12h00 Sala 2 Voluntário 09 Conceição /,
    );
    // Nobody is cut: 20 in Manhã, 28 in Tarde, 48 in Noite and 48 in Retiro.
    expect(pages.join(' ').match(/Conceição/g)).toHaveLength(144);
    expect(pages.join(' ')).not.toMatch(/cont\./i);
    // The table image is still one image, never cut into pages.
    const preview = (page: number) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/export/ministries/${fixture.kidsId}/cycles/${cycleId}/preview?format=png&page=${page}`,
      });
    expect((await preview(1)).statusCode).toBe(200);
    expect((await preview(2)).statusCode).toBe(404);
  });
});

/** Each page's text, whitespace collapsed. */
function pdfPages(pdf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'event-groups-test-'));
  const path = join(dir, 'out.pdf');
  writeFileSync(path, pdf);
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
  });
  return text
    .split('\f')
    .slice(0, -1)
    .map((page) => page.replace(/\s+/g, ' ').trim());
}

function pdfText(pdf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'event-groups-test-'));
  const path = join(dir, 'out.pdf');
  writeFileSync(path, pdf);
  return execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
  }).replace(/\s+/g, ' ');
}
