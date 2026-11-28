import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, expect, it, vi } from 'vitest';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type {
  GetSchedule200,
  ListScheduleExportCycles200CyclesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getScheduleExportFile: vi.fn(),
  getScheduleExportData: vi.fn(),
  getScheduleExportPreview: vi.fn(),
  listScheduleExportCycles: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  exportApi: {
    getScheduleExportFile: state.getScheduleExportFile,
    getScheduleExportData: state.getScheduleExportData,
    getScheduleExportPreview: state.getScheduleExportPreview,
    listScheduleExportCycles: state.listScheduleExportCycles,
  },
}));

function cycle(
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  isCurrent = false,
): ListScheduleExportCycles200CyclesItem {
  return { id, name, startDate, endDate, isCurrent };
}

const FEBRUARY = cycle('feb', 'Fevereiro 2027', '2027-02-01', '2027-02-28');
const JANUARY = cycle('c', 'January 2027', '2027-01-01', '2027-01-31', true);
const DECEMBER = cycle('dec', 'Dezembro 2026', '2026-12-01', '2026-12-31');
const QUARTER = cycle('q1', '1º trimestre 2026', '2026-01-01', '2026-03-31');

beforeEach(() => {
  vi.resetAllMocks();
  state.data = { ...SCHEDULE, stage: 'published' };
  state.getScheduleExportFile.mockResolvedValue(new Blob(['%PDF']));
  // The files are fetched once the preview settles.
  state.getScheduleExportPreview.mockImplementation(
    (_ministryId: string, _cycleId: string, params: { page: number }) =>
      params.page === 1
        ? Promise.resolve(new Blob(['<svg/>']))
        : Promise.reject(
            new AxiosError('404', 'ERR_BAD_REQUEST', undefined, undefined, {
              status: 404,
              statusText: '',
              headers: {},
              config: { headers: new AxiosHeaders() },
              data: null,
            }),
          ),
  );
  state.getScheduleExportData.mockResolvedValue({
    isDraft: false,
    duplicateNames: [],
  });
  state.listScheduleExportCycles.mockImplementation(
    async (_ministryId: string, params?: { q?: string }) => ({
      cycles: params?.q ? [QUARTER] : [FEBRUARY, JANUARY, DECEMBER, QUARTER],
    }),
  );
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

interface DownloadInput {
  user: ReturnType<typeof userEvent.setup>;
  dialog: HTMLElement;
}

/** Baixar turns on once the export data has loaded. */
async function download({ user, dialog }: DownloadInput) {
  const button = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

async function openDialog() {
  const user = userEvent.setup();
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  await user.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  const dialog = screen.getByRole('dialog', { name: m.export_dialog_title() });
  return { user, dialog };
}

function cycleName(dialog: HTMLElement) {
  return within(dialog).getByRole('button', { name: m.export_choose_cycle() });
}

it('steps one Cycle at a time from the Schedule it came from', async () => {
  const { user, dialog } = await openDialog();
  const previous = within(dialog).getByRole('button', {
    name: m.export_previous_cycle(),
  });
  const next = within(dialog).getByRole('button', {
    name: m.export_next_cycle(),
  });

  expect(cycleName(dialog)).toHaveTextContent('January 2027');
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  expect(cycleName(dialog)).toHaveTextContent('Fevereiro 2027');
  expect(next).toBeDisabled();
  await user.click(previous);
  await user.click(previous);
  expect(cycleName(dialog)).toHaveTextContent('Dezembro 2026');
  expect(
    within(dialog).getByText(
      m.export_whole_cycle({ span: '01/12/2026 – 31/12/2026' }),
    ),
  ).toBeVisible();

  await download({ user, dialog });
  await waitFor(() =>
    expect(state.getScheduleExportFile).toHaveBeenLastCalledWith('m', 'dec', {
      format: 'pdf',
    }),
  );
});

it('lists Cycles by start year with span and "atual", and searches on the server', async () => {
  const { user, dialog } = await openDialog();

  await user.click(cycleName(dialog));
  const list = await within(dialog).findByRole('list', {
    name: '2027',
  });
  expect(
    within(list)
      .getAllByRole('button')
      .map((option) => option.textContent),
  ).toEqual([
    'Fevereiro 202701/02/2027 – 28/02/2027',
    `January 202701/01/2027 – 31/01/2027${m.export_current_cycle()}`,
  ]);
  expect(within(dialog).getByRole('list', { name: '2026' })).toBeVisible();

  await user.type(
    within(dialog).getByRole('searchbox', { name: m.export_search_cycles() }),
    'fev 2026',
  );
  await waitFor(() =>
    expect(state.listScheduleExportCycles).toHaveBeenLastCalledWith('m', {
      q: 'fev 2026',
    }),
  );
  await waitFor(() =>
    expect(within(dialog).queryByRole('list', { name: '2027' })).toBeNull(),
  );
  await user.click(
    within(dialog).getByRole('button', { name: /1º trimestre 2026/ }),
  );

  expect(cycleName(dialog)).toHaveTextContent('1º trimestre 2026');
  expect(within(dialog).queryByRole('searchbox')).toBeNull();
});

it('narrows the export to dates inside the Cycle', async () => {
  const { user, dialog } = await openDialog();

  await user.click(
    within(dialog).getByRole('radio', { name: m.export_pick_dates() }),
  );
  const from = within(dialog).getByRole('button', { name: m.export_from() });
  await pickCalendarDate({ user, trigger: from, date: '2027-01-10' });
  await pickCalendarDate({
    user,
    trigger: within(dialog).getByRole('button', { name: m.export_to() }),
    date: '2027-01-20',
  });
  expect(
    await within(dialog).findByText(
      m.export_summary({
        files: m.export_files_one(),
        format: m.export_format_pdf(),
        span: '10/01/2027 – 20/01/2027',
      }),
    ),
  ).toBeVisible();
  await download({ user, dialog });
  await waitFor(() =>
    expect(state.getScheduleExportFile).toHaveBeenLastCalledWith('m', 'c', {
      format: 'pdf',
      from: '2027-01-10',
      to: '2027-01-20',
    }),
  );
  expect(state.getScheduleExportData).toHaveBeenLastCalledWith('m', 'c', {
    from: '2027-01-10',
    to: '2027-01-20',
  });
});

it('resets the dates to the whole Cycle when the Cycle changes', async () => {
  const { user, dialog } = await openDialog();
  await user.click(
    within(dialog).getByRole('radio', { name: m.export_pick_dates() }),
  );
  await pickCalendarDate({
    user,
    trigger: within(dialog).getByRole('button', { name: m.export_from() }),
    date: '2027-01-10',
  });

  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: m.export_previous_cycle() }),
    ).toBeEnabled(),
  );
  await user.click(
    within(dialog).getByRole('button', { name: m.export_previous_cycle() }),
  );

  expect(
    within(dialog).getByRole('radio', {
      name: m.export_whole_cycle({ span: '01/12/2026 – 31/12/2026' }),
    }),
  ).toBeChecked();
  expect(
    within(dialog).queryByRole('button', { name: m.export_from() }),
  ).toBeNull();
  await download({ user, dialog });
  await waitFor(() =>
    expect(state.getScheduleExportFile).toHaveBeenLastCalledWith('m', 'dec', {
      format: 'pdf',
    }),
  );
});

it('shows the server message of a refused export', async () => {
  const body = new Blob([
    JSON.stringify({
      error: 'EXPORT_RANGE_OUTSIDE_CYCLE',
      message: 'Escolha datas entre 01/01/2027 e 31/01/2027.',
    }),
  ]);
  state.getScheduleExportFile.mockRejectedValue(
    new AxiosError('422', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 422,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: body,
    }),
  );
  const { dialog } = await openDialog();

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Escolha datas entre 01/01/2027 e 31/01/2027.',
  );
  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
});

it('shows the server message when the export data is refused', async () => {
  state.getScheduleExportData.mockRejectedValue(
    new AxiosError('400', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: 'INVALID_DATE_RANGE',
        message: 'A data de término não pode ser anterior à data de início.',
      },
    }),
  );
  const { dialog } = await openDialog();

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'A data de término não pode ser anterior à data de início.',
  );
  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
});
