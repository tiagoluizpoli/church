import { m } from '@church/i18n/messages';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type {
  GetSchedule200,
  GetScheduleExportData200,
  GetScheduleExportData200PartsItem,
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

const EXPORT_DATA: GetScheduleExportData200 = {
  ministry: { name: 'Kids' },
  cycle: {
    name: 'Outubro 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  },
  range: { from: '2026-10-01', to: '2026-10-31' },
  isDraft: false,
  hasUnsentChanges: false,
  singleSector: null,
  singleRole: null,
  duplicateNames: [],
  parts: [part({})],
};

const WEEKS = [
  part({ kind: 'week', week: { from: '2026-10-01', to: '2026-10-04' } }),
  part({ kind: 'week', week: { from: '2026-10-05', to: '2026-10-11' } }),
];

const ROLE = { id: 'r1', name: 'Professor' };
const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
const notFound = new AxiosError('Not Found', '404', undefined, undefined, {
  status: 404,
} as never);
const downloads: string[] = [];

interface ExportParams {
  format?: string;
  split?: string;
  part?: number;
  page?: number;
}

function dataCalls() {
  return state.getScheduleExportData.mock.calls.map(([, , params]) => params);
}

function previewCalls(): ExportParams[] {
  return state.getScheduleExportPreview.mock.calls.map(
    ([, , params]) => params,
  );
}

function withGroups() {
  state.getEventGroups.mockResolvedValue({
    groups: [{ name: 'Domingos', templates: [] }],
    catchAllName: null,
    templates: [],
  });
}

function withRoles(count: number) {
  state.listMinistryRoles.mockResolvedValue({
    roles: Array.from({ length: count }, (_, index) => ({
      ...ROLE,
      id: `r${index}`,
    })),
  });
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
  withRoles(1);
  state.getScheduleExportData.mockImplementation(
    (_ministryId: string, _cycleId: string, params?: ExportParams) =>
      Promise.resolve(
        params?.split === 'week'
          ? { ...EXPORT_DATA, parts: WEEKS }
          : EXPORT_DATA,
      ),
  );
  // One page per table image part; two parts when split by week.
  state.getScheduleExportPreview.mockImplementation(
    (_ministryId: string, _cycleId: string, params: ExportParams) => {
      const parts = params.split === 'week' ? 2 : 1;
      const pages = params.format === 'pdf' ? parts : 1;
      const partNumber = params.part ?? 1;
      return (params.page ?? 1) <= pages && partNumber <= parts
        ? Promise.resolve(svg)
        : Promise.reject(notFound);
    },
  );
  // One table image per part, read by page until 404; one PDF.
  state.getScheduleExportFile.mockImplementation(
    (_ministryId: string, _cycleId: string, params: ExportParams) => {
      const parts = params.split === 'week' ? 2 : 1;
      return (params.page ?? 1) <= 1 && (params.part ?? 1) <= parts
        ? Promise.resolve(new Blob([params.format ?? '']))
        : Promise.reject(notFound);
    },
  );
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function openDialog() {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  return screen.getByRole('dialog', { name: m.export_dialog_title() });
}

function splitGroup(dialog: HTMLElement) {
  return within(dialog).getByRole('radiogroup', {
    name: m.export_split_label(),
  });
}

function splitOptions(dialog: HTMLElement) {
  return within(splitGroup(dialog))
    .getAllByRole('radio')
    .map((radio) => radio.closest('label')?.textContent);
}

it('starts on Não separar without Event groups, offering no split by group', async () => {
  const dialog = await openDialog();

  await waitFor(() =>
    expect(splitOptions(dialog)).toEqual([
      m.export_split_none(),
      m.export_split_week(),
      m.export_split_sector(),
    ]),
  );
  expect(
    within(dialog).getByRole('radio', { name: m.export_split_none() }),
  ).toBeChecked();
});

it('starts on Por grupo when the Ministry has Event groups', async () => {
  withGroups();
  const dialog = await openDialog();

  const byGroup = await within(dialog).findByRole('radio', {
    name: m.export_split_group(),
  });
  await waitFor(() => expect(byGroup).toBeChecked());
  await waitFor(() => expect(dataCalls()).toContainEqual({ split: 'group' }));
  await waitFor(() =>
    expect(previewCalls()).toContainEqual({
      format: 'pdf',
      page: 1,
      split: 'group',
    }),
  );
});

it('offers Por função only when the Ministry has more than one Role', async () => {
  withRoles(2);
  const dialog = await openDialog();

  expect(
    await within(dialog).findByRole('radio', { name: m.export_split_role() }),
  ).toBeVisible();
  expect(splitOptions(dialog)).toEqual([
    m.export_split_none(),
    m.export_split_week(),
    m.export_split_sector(),
    m.export_split_role(),
  ]);
});

it('never remembers the split between exports', async () => {
  withGroups();
  const dialog = await openDialog();
  fireEvent.click(
    await within(dialog).findByRole('radio', { name: m.export_split_week() }),
  );
  expect(
    within(dialog).getByRole('radio', { name: m.export_split_week() }),
  ).toBeChecked();

  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: m.export_dialog_title() }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  const reopened = screen.getByRole('dialog', {
    name: m.export_dialog_title(),
  });

  expect(
    within(reopened).getByRole('radio', { name: m.export_split_group() }),
  ).toBeChecked();
});

it('previews and downloads one table image per part, named after it', async () => {
  const dialog = await openDialog();
  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );
  fireEvent.click(
    await within(dialog).findByRole('radio', { name: m.export_split_week() }),
  );

  const weekOne = m.export_part_week({ span: '01–04 out' });
  const weekTwo = m.export_part_week({ span: '05–11 out' });
  await waitFor(() =>
    expect(
      within(dialog)
        .getAllByRole('img')
        .map((image) => image.getAttribute('alt')),
    ).toEqual([
      m.export_preview_part_page({ part: weekOne, page: '1' }),
      m.export_preview_part_page({ part: weekTwo, page: '1' }),
    ]),
  );
  expect(previewCalls()).toContainEqual({
    format: 'png',
    split: 'week',
    part: 2,
    page: 1,
  });

  const download = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  await waitFor(() => expect(download).toBeEnabled());
  fireEvent.click(download);

  const name = m.export_file_name({
    ministry: SCHEDULE.ministry.name,
    cycle: SCHEDULE.cycle.name,
  });
  await waitFor(() =>
    expect(downloads).toEqual([
      `${name} - ${weekOne}.png`,
      `${name} - ${weekTwo}.png`,
    ]),
  );
  expect(
    state.getScheduleExportFile.mock.calls
      .map(([, , params]) => params)
      .filter((params) => params.split),
  ).toEqual([
    { format: 'png', split: 'week', part: 1, page: 1 },
    { format: 'png', split: 'week', part: 1, page: 2 },
    { format: 'png', split: 'week', part: 2, page: 1 },
    { format: 'png', split: 'week', part: 2, page: 2 },
    { format: 'png', split: 'week', part: 3, page: 1 },
  ]);
});

it('downloads one PDF holding every part', async () => {
  const dialog = await openDialog();
  fireEvent.click(
    await within(dialog).findByRole('radio', { name: m.export_split_week() }),
  );
  const download = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  await waitFor(() => expect(dataCalls()).toContainEqual({ split: 'week' }));
  await waitFor(() => expect(download).toBeEnabled());
  fireEvent.click(download);

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({
        ministry: SCHEDULE.ministry.name,
        cycle: SCHEDULE.cycle.name,
      })}.pdf`,
    ]),
  );
  expect(
    state.getScheduleExportFile.mock.calls
      .map(([, , params]) => params)
      .filter((params) => params.split),
  ).toEqual([{ format: 'pdf', split: 'week' }]);
});
