import { m } from '@church/i18n/messages';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readWorkbook, sheetValues } from './read-workbook';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type {
  GetSchedule200,
  GetScheduleExportData200,
  GetScheduleExportData200PartsItem,
  GetScheduleExportData200PartsItemGroupsItemEventsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getEventGroups: vi.fn(),
  listMinistryRoles: vi.fn(),
  getScheduleExportFile: vi.fn(),
  getScheduleExportData: vi.fn(),
  getScheduleExportPreview: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getEventGroups: state.getEventGroups,
    listMinistryRoles: state.listMinistryRoles,
  },
  exportApi: {
    getScheduleExportFile: state.getScheduleExportFile,
    getScheduleExportData: state.getScheduleExportData,
    getScheduleExportPreview: state.getScheduleExportPreview,
  },
}));
vi.mock('@tanstack/react-router', () => ({ Link: () => null }));

type ExportEvent = GetScheduleExportData200PartsItemGroupsItemEventsItem;

const SUNDAY: ExportEvent = {
  startDay: '2027-01-03',
  endDay: '2027-01-03',
  title: 'Culto de domingo',
  cancelled: false,
  timeBlocks: [
    {
      label: 'Manhã',
      cancelled: false,
      shifts: [
        {
          label: null,
          day: null,
          startTime: '10:30',
          endTime: '12:00',
          sectors: [
            {
              name: 'Berçário',
              paletteIndex: 0,
              people: [
                { name: 'Ana Beatriz Carvalho Souza', role: 'Professor' },
                { name: 'Bruno Lima', role: 'Auxiliar' },
              ],
            },
            {
              name: 'Maternal',
              paletteIndex: 1,
              people: [{ name: 'Carla Dias', role: 'Professor' }],
            },
          ],
        },
      ],
    },
    // Its label repeats the title, so the title reads alone.
    { label: 'culto de domingo', cancelled: true, shifts: [] },
  ],
};

const NO_SERVICE: ExportEvent = {
  startDay: '2027-01-10',
  endDay: '2027-01-10',
  title: 'Culto de domingo',
  cancelled: true,
  timeBlocks: [],
};

const RETREAT: ExportEvent = {
  startDay: '2027-01-16',
  endDay: '2027-01-17',
  title: 'Retiro',
  cancelled: false,
  timeBlocks: [
    {
      label: null,
      cancelled: false,
      shifts: [
        {
          label: 'Turno 1',
          day: '2027-01-16',
          startTime: '08:00',
          endTime: '12:00',
          sectors: [
            {
              name: 'Berçário',
              paletteIndex: 0,
              people: [
                { name: 'Ana Beatriz Carvalho Souza', role: 'Professor' },
              ],
            },
          ],
        },
        {
          label: 'Turno 2',
          day: '2027-01-17',
          startTime: '14:00',
          endTime: '18:00',
          sectors: [
            {
              name: 'Berçário',
              paletteIndex: 0,
              people: [{ name: 'Bruno Lima', role: 'Auxiliar' }],
            },
          ],
        },
      ],
    },
  ],
};

function part(
  fields: Partial<GetScheduleExportData200PartsItem>,
): GetScheduleExportData200PartsItem {
  return {
    kind: 'all',
    name: null,
    week: null,
    singleSector: null,
    singleRole: null,
    groups: [],
    ...fields,
  };
}

function list(...events: ExportEvent[]) {
  return [{ kind: 'list' as const, name: null, events }];
}

const EXPORT_DATA: GetScheduleExportData200 = {
  ministry: { name: 'Kids' },
  cycle: {
    name: 'Janeiro 2027',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
  },
  range: { from: '2027-01-01', to: '2027-01-31' },
  isDraft: false,
  hasUnsentChanges: false,
  singleSector: null,
  singleRole: null,
  duplicateNames: [],
  parts: [part({ groups: list(SUNDAY, NO_SERVICE, RETREAT) })],
};

const COLUMNS = [
  'Data',
  'Dia',
  'Evento',
  'Horário',
  'Setor',
  'Função',
  'Voluntário',
];
const RED = '#d3252a';
const MUTED = '#545f6b';
const downloads: { name: string; file: File }[] = [];
const notFound = new AxiosError('Not Found', '404', undefined, undefined, {
  status: 404,
} as never);

/** One page, then 404: how the server ends a read by page. */
function onePage(blob: Blob) {
  return (_ministryId: string, _cycleId: string, params: { page?: number }) =>
    (params.page ?? 1) <= 1 ? Promise.resolve(blob) : Promise.reject(notFound);
}

function withData(data: GetScheduleExportData200) {
  state.getScheduleExportData.mockResolvedValue(data);
}

beforeEach(() => {
  vi.resetAllMocks();
  downloads.length = 0;
  state.data = { ...SCHEDULE, stage: 'published' };
  state.getEventGroups.mockResolvedValue({
    groups: [],
    catchAllName: null,
    templates: [],
  });
  state.listMinistryRoles.mockResolvedValue({
    roles: [{ id: 'r1', name: 'Professor' }],
  });
  withData(EXPORT_DATA);
  state.getScheduleExportPreview.mockImplementation(
    onePage(new Blob(['<svg/>'], { type: 'image/svg+xml' })),
  );
  state.getScheduleExportFile.mockImplementation(onePage(new Blob(['pdf'])));
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  // A phone whose share sheet takes every file it is offered.
  Object.defineProperty(window.navigator, 'canShare', {
    configurable: true,
    value: () => true,
  });
  let saved: File | undefined;
  URL.createObjectURL = vi.fn((file: Blob) => {
    if (file instanceof File) saved = file;
    return 'blob:export';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (saved) downloads.push({ name: this.download, file: saved });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, 'canShare');
});

async function openExcel() {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  const dialog = screen.getByRole('dialog', { name: m.export_dialog_title() });
  fireEvent.click(
    within(dialog).getByRole('radio', { name: 'Planilha Excel' }),
  );
  return dialog;
}

interface DownloadInput {
  dialog: HTMLElement;
  split?: string;
}

/** Picks the split, downloads, and reads the one workbook back. */
async function downloadWorkbook({ dialog, split }: DownloadInput) {
  if (split) {
    fireEvent.click(await within(dialog).findByRole('radio', { name: split }));
  }
  const download = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  await waitFor(() => expect(download).toBeEnabled());
  fireEvent.click(download);
  await waitFor(() => expect(downloads).toHaveLength(1));
  const [saved] = downloads;
  if (!saved) throw new Error('nothing was downloaded');
  return {
    name: saved.name,
    file: saved.file,
    sheets: await readWorkbook(saved.file),
  };
}

it('downloads one "Escala" sheet listing every spot in the export order, without Compartilhar', async () => {
  const dialog = await openExcel();

  const { name, file, sheets } = await downloadWorkbook({ dialog });

  expect(
    within(dialog).queryByRole('button', { name: m.export_share() }),
  ).not.toBeInTheDocument();
  expect(name).toBe('Escala - Worship - January 2027.xlsx');
  expect(file.type).toBe(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  expect(sheets.map((sheet) => sheet.name)).toEqual(['Escala']);
  const [sheet] = sheets;
  if (!sheet) throw new Error('no sheet');
  expect(sheetValues(sheet)).toEqual([
    ['Escala do Kids · Janeiro 2027'],
    ['01/01/2027 – 31/01/2027'],
    [],
    COLUMNS,
    [
      '03/01/2027',
      'dom',
      'Culto de domingo · Manhã',
      '10h30–12h00',
      'Berçário',
      'Professor',
      'Ana Beatriz Carvalho Souza',
    ],
    [
      '03/01/2027',
      'dom',
      'Culto de domingo · Manhã',
      '10h30–12h00',
      'Berçário',
      'Auxiliar',
      'Bruno Lima',
    ],
    [
      '03/01/2027',
      'dom',
      'Culto de domingo · Manhã',
      '10h30–12h00',
      'Maternal',
      'Professor',
      'Carla Dias',
    ],
    ['03/01/2027', 'dom', 'Culto de domingo', '', '', '', 'Cancelado'],
    ['10/01/2027', 'dom', 'Culto de domingo', '', '', '', 'Não haverá culto'],
    [
      '16/01/2027',
      'sáb',
      'Retiro',
      'Turno 1 · sáb · 08h00–12h00',
      'Berçário',
      'Professor',
      'Ana Beatriz Carvalho Souza',
    ],
    [
      '16/01/2027',
      'sáb',
      'Retiro',
      'Turno 2 · dom · 14h00–18h00',
      'Berçário',
      'Auxiliar',
      'Bruno Lima',
    ],
  ]);
  // Data is a real date shown as dd/mm/aaaa.
  expect(sheet.rows[4]?.[0]?.dateFormat).toBe('dd/mm/yyyy');
  // Everything down to the column header stays in view, which has filters.
  expect(sheet.frozenRows).toBe(4);
  expect(sheet.autoFilter).toBe('A4:G11');
  expect(sheet.filterDatabase).toBe("'Escala'!$A$4:$G$11");
});

it('writes cancelled rows in red text', async () => {
  const dialog = await openExcel();

  const { sheets } = await downloadWorkbook({ dialog });

  const rows = sheets[0]?.rows ?? [];
  const textColors = (row: number) =>
    rows[row]?.filter((cell) => cell).map((cell) => cell?.textColor);
  expect(textColors(7)).toEqual([RED, RED, RED, RED]);
  expect(textColors(8)).toEqual([RED, RED, RED, RED]);
  expect(textColors(4)).toEqual(Array(7).fill(undefined));
});

it('marks a draft under the title and lists its empty spots as muted "Vaga" rows', async () => {
  withData({
    ...EXPORT_DATA,
    isDraft: true,
    parts: [
      part({
        groups: list({
          ...NO_SERVICE,
          cancelled: false,
          timeBlocks: [
            {
              label: null,
              cancelled: false,
              shifts: [
                {
                  label: null,
                  day: null,
                  startTime: '19:00',
                  endTime: '21:00',
                  sectors: [
                    {
                      name: 'Maternal',
                      paletteIndex: 1,
                      people: [
                        { name: 'Carla Dias', role: 'Professor' },
                        { name: null, role: 'Auxiliar' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    ],
  });
  const dialog = await openExcel();

  const { name, sheets } = await downloadWorkbook({ dialog });

  expect(name).toBe('Escala - Worship - January 2027 - Rascunho.xlsx');
  const [sheet] = sheets;
  if (!sheet) throw new Error('no sheet');
  expect(sheetValues(sheet)).toEqual([
    ['Escala do Kids · Janeiro 2027'],
    ['01/01/2027 – 31/01/2027'],
    ['Rascunho'],
    [],
    COLUMNS,
    [
      '10/01/2027',
      'dom',
      'Culto de domingo',
      '19h00–21h00',
      'Maternal',
      'Professor',
      'Carla Dias',
    ],
    [
      '10/01/2027',
      'dom',
      'Culto de domingo',
      '19h00–21h00',
      'Maternal',
      'Auxiliar',
      'Vaga',
    ],
  ]);
  expect(sheet.rows[6]?.[6]?.textColor).toBe(MUTED);
  expect(sheet.rows[5]?.[6]?.textColor).toBeUndefined();
  expect(sheet.frozenRows).toBe(5);
  expect(sheet.autoFilter).toBe('A5:G7');
});

it('drops Setor and Função from a sheet with only one, stating it in the header', async () => {
  withData({
    ...EXPORT_DATA,
    parts: [
      part({
        kind: 'sector',
        name: 'Maternal',
        singleSector: 'Maternal',
        singleRole: 'Professor',
        groups: list({
          ...SUNDAY,
          timeBlocks: [
            {
              label: null,
              cancelled: false,
              shifts: [
                {
                  label: null,
                  day: null,
                  startTime: '10:30',
                  endTime: '12:00',
                  sectors: [
                    {
                      name: 'Maternal',
                      paletteIndex: 1,
                      people: [{ name: 'Carla Dias', role: 'Professor' }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
      part({
        kind: 'sector',
        name: 'Berçário',
        singleSector: 'Berçário',
        groups: list(RETREAT),
      }),
    ],
  });
  const dialog = await openExcel();

  const { sheets } = await downloadWorkbook({
    dialog,
    split: m.export_split_sector(),
  });

  expect(sheets.map((sheet) => sheet.name)).toEqual(['Maternal', 'Berçário']);
  const [maternal, bercario] = sheets;
  if (!maternal || !bercario) throw new Error('missing sheets');
  expect(sheetValues(maternal)).toEqual([
    ['Escala do Kids · Janeiro 2027'],
    ['01/01/2027 – 31/01/2027'],
    ['Todos servem como Professor em Maternal'],
    [],
    ['Data', 'Dia', 'Evento', 'Horário', 'Voluntário'],
    ['03/01/2027', 'dom', 'Culto de domingo', '10h30–12h00', 'Carla Dias'],
  ]);
  expect(maternal.autoFilter).toBe('A5:E6');
  expect(sheetValues(bercario).slice(2)).toEqual([
    ['Todos servem em Berçário'],
    [],
    ['Data', 'Dia', 'Evento', 'Horário', 'Função', 'Voluntário'],
    [
      '16/01/2027',
      'sáb',
      'Retiro',
      'Turno 1 · sáb · 08h00–12h00',
      'Professor',
      'Ana Beatriz Carvalho Souza',
    ],
    [
      '16/01/2027',
      'sáb',
      'Retiro',
      'Turno 2 · dom · 14h00–18h00',
      'Auxiliar',
      'Bruno Lima',
    ],
  ]);
  expect(bercario.filterDatabase).toBe("'Berçário'!$A$5:$F$7");
});

it('names one sheet per part, weeks as "Semana", without banned characters, at most 31 long and unique', async () => {
  const groups = list(NO_SERVICE);
  withData({
    ...EXPORT_DATA,
    parts: [
      part({
        kind: 'week',
        week: { from: '2027-01-04', to: '2027-01-10' },
        groups,
      }),
      part({ kind: 'group', name: 'Sala: 1/2 [A]*?\\', groups }),
      part({
        kind: 'group',
        name: 'Cultos de domingo de manhã e de noite',
        groups,
      }),
      part({
        kind: 'group',
        name: 'Cultos de domingo de manhã e de tarde',
        groups,
      }),
      part({ kind: 'group', name: 'Sala 12 A', groups }),
      part({ kind: 'catchAll', name: null, groups }),
    ],
  });
  const dialog = await openExcel();

  const { sheets } = await downloadWorkbook({
    dialog,
    split: m.export_split_week(),
  });

  expect(sheets.map((sheet) => sheet.name)).toEqual([
    'Semana 04–10 jan',
    'Sala 12 A',
    'Cultos de domingo de manhã e de',
    'Cultos de domingo de manhã (2)',
    'Sala 12 A (2)',
    'Outros',
  ]);
});

it('never starts or ends a sheet name with an apostrophe, which Excel refuses', async () => {
  const groups = list(NO_SERVICE);
  withData({
    ...EXPORT_DATA,
    parts: [
      part({ kind: 'group', name: "'Louvor'", groups }),
      part({ kind: 'group', name: "Jovens d'Ouro", groups }),
      part({ kind: 'group', name: "''", groups }),
      part({ kind: 'group', name: "Louvor'", groups }),
      part({ kind: 'group', name: `${'a'.repeat(30)}'bc`, groups }),
    ],
  });
  const dialog = await openExcel();

  const { sheets } = await downloadWorkbook({
    dialog,
    split: m.export_split_week(),
  });

  expect(sheets.map((sheet) => sheet.name)).toEqual([
    'Louvor',
    "Jovens d'Ouro",
    'Escala',
    'Louvor (2)',
    'a'.repeat(30),
  ]);
});

it('styles the title and column headers, tints each Setor cell and fits names unwrapped', async () => {
  const dialog = await openExcel();

  const { sheets } = await downloadWorkbook({ dialog });

  const [sheet] = sheets;
  if (!sheet) throw new Error('no sheet');
  expect(sheet.rows[0]?.[0]?.bold).toBe(true);
  expect(sheet.rows[1]?.[0]?.bold).toBe(false);
  const header = sheet.rows[3] ?? [];
  expect(header.map((cell) => cell?.bold)).toEqual(Array(7).fill(true));
  expect(new Set(header.map((cell) => cell?.fill))).toEqual(
    new Set(['#e5effa']),
  );
  const fills = sheet.rows.slice(4).map((row) => row.map((cell) => cell?.fill));
  // Berçário and Maternal in their Sector colors; nothing else is filled.
  expect(fills).toEqual([
    [
      undefined,
      undefined,
      undefined,
      undefined,
      '#dcedff',
      undefined,
      undefined,
    ],
    [
      undefined,
      undefined,
      undefined,
      undefined,
      '#dcedff',
      undefined,
      undefined,
    ],
    [
      undefined,
      undefined,
      undefined,
      undefined,
      '#d2f3f0',
      undefined,
      undefined,
    ],
    Array(7).fill(undefined),
    Array(7).fill(undefined),
    [
      undefined,
      undefined,
      undefined,
      undefined,
      '#dcedff',
      undefined,
      undefined,
    ],
    [
      undefined,
      undefined,
      undefined,
      undefined,
      '#dcedff',
      undefined,
      undefined,
    ],
  ]);
  expect(sheet.rows.flat().some((cell) => cell?.wrap)).toBe(false);
  // Each column fits its longest cell, its header leaving room for the filter.
  expect(sheet.widths).toEqual([12, 7, 26, 29, 10, 11, 28]);
});

it('previews the sheets and their first rows from the same data', async () => {
  const dialog = await openExcel();

  const preview = await within(dialog).findByRole('region', {
    name: m.export_preview_label(),
  });
  expect(
    await within(preview).findByRole('table', { name: 'Escala' }),
  ).toBeVisible();
  const table = within(preview).getByRole('table', { name: 'Escala' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(COLUMNS);
  expect(within(table).getAllByRole('row')[1]?.textContent).toContain(
    'Ana Beatriz Carvalho Souza',
  );
  expect(state.getScheduleExportPreview).not.toHaveBeenCalledWith(
    'm',
    'c',
    expect.objectContaining({ format: 'xlsx' }),
  );
});
