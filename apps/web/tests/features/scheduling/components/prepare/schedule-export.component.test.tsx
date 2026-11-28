import { m } from '@church/i18n/messages';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type { GetSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getScheduleExportFile: vi.fn(),
  getScheduleExportPreview: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  exportApi: {
    getScheduleExportFile: state.getScheduleExportFile,
    getScheduleExportPreview: state.getScheduleExportPreview,
  },
}));

const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
const notFound = new AxiosError('Not Found', '404', undefined, undefined, {
  status: 404,
} as never);
const downloads: string[] = [];

/** The server's preview: two A4 pages for the PDF, one page for the image. */
function previewPages({ pdfPages = 2 } = {}) {
  state.getScheduleExportPreview.mockImplementation(
    (
      _ministryId: string,
      _cycleId: string,
      params: { format: string; page: number },
    ) =>
      params.page <= (params.format === 'pdf' ? pdfPages : 1)
        ? Promise.resolve(svg)
        : Promise.reject(notFound),
  );
}

function previewCalls() {
  return state.getScheduleExportPreview.mock.calls.map(
    ([, , params]) => params,
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

async function openDialog() {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  return screen.getByRole('dialog', { name: m.export_dialog_title() });
}

beforeEach(() => {
  vi.resetAllMocks();
  downloads.length = 0;
  state.data = {
    ...SCHEDULE,
    stage: 'published',
    cycle: { ...SCHEDULE.cycle, name: 'Março: 2027' },
  };
  state.getScheduleExportFile.mockResolvedValue(pdf);
  previewPages();
  setOnline(true);
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

it('opens on the Schedule Cycle and downloads the whole Cycle as a PDF', async () => {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);

  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  const dialog = screen.getByRole('dialog', { name: m.export_dialog_title() });
  expect(within(dialog).getByText('Março: 2027')).toBeVisible();
  expect(
    within(dialog).getByText(
      m.export_whole_cycle({ span: '01/01/2027 – 31/01/2027' }),
    ),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('radio', { name: m.export_format_pdf() }),
  ).toBeChecked();

  fireEvent.click(
    within(dialog).getByRole('button', { name: m.export_download() }),
  );

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })}.pdf`,
    ]),
  );
  expect(state.getScheduleExportFile).toHaveBeenCalledExactlyOnceWith(
    'm',
    'c',
    { format: 'pdf' },
  );
  expect(URL.createObjectURL).toHaveBeenCalledWith(pdf);
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: m.export_dialog_title() }),
    ).not.toBeInTheDocument(),
  );
});

it('keeps the dialog open and says so when the download fails', async () => {
  state.getScheduleExportFile.mockRejectedValue(new Error('offline'));
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);

  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  fireEvent.click(screen.getByRole('button', { name: m.export_download() }));

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledExactlyOnceWith(
      m.export_download_failed(),
    ),
  );
  expect(downloads).toEqual([]);
  expect(
    screen.getByRole('dialog', { name: m.export_dialog_title() }),
  ).toBeVisible();
});

it('previews every page of the file with a link to each at full size', async () => {
  const dialog = await openDialog();

  const pages = await within(dialog).findAllByRole('img', {
    name: /./,
  });
  expect(pages.map((page) => page.getAttribute('alt'))).toEqual([
    m.export_preview_page({ page: '1' }),
    m.export_preview_page({ page: '2' }),
  ]);
  const links = within(dialog).getAllByRole('link', {
    name: m.export_preview_full_size(),
  });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute('href', 'blob:export');
    expect(link).toHaveAttribute('target', '_blank');
  }
  expect(previewCalls()).toEqual([
    { format: 'pdf', page: 1 },
    { format: 'pdf', page: 2 },
    { format: 'pdf', page: 3 },
  ]);
});

it('requests the preview 300 ms after the last settings change', async () => {
  const dialog = await openDialog();
  await within(dialog).findAllByRole('img');
  const settled = previewCalls().length;

  for (const name of [
    m.export_format_table_image(),
    m.export_format_pdf(),
    m.export_format_table_image(),
  ]) {
    fireEvent.click(within(dialog).getByRole('radio', { name }));
  }
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  expect(previewCalls()).toHaveLength(settled);

  await waitFor(() =>
    expect(previewCalls().slice(settled)).toEqual([
      { format: 'png', page: 1 },
      { format: 'png', page: 2 },
    ]),
  );
  expect(
    await within(dialog).findByRole('img', {
      name: m.export_preview_page({ page: '1' }),
    }),
  ).toBeVisible();
});

it('warns next to the preview that the table image arrives shrunk on WhatsApp', async () => {
  const dialog = await openDialog();
  expect(
    within(dialog).queryByText(m.export_table_image_notice()),
  ).not.toBeInTheDocument();

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );

  expect(within(dialog).getByText(m.export_table_image_notice())).toBeVisible();
});

it('downloads the table image as one PNG', async () => {
  const png = new Blob(['PNG'], { type: 'image/png' });
  state.getScheduleExportFile.mockResolvedValue(png);
  const dialog = await openDialog();

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: m.export_download() }),
  );

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })}.png`,
    ]),
  );
  expect(state.getScheduleExportFile).toHaveBeenCalledExactlyOnceWith(
    'm',
    'c',
    { format: 'png' },
  );
});

it('says there is no preview and no export without a connection', async () => {
  setOnline(false);
  const dialog = await openDialog();

  expect(within(dialog).getByText(m.export_offline())).toBeVisible();
  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
  expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
  expect(state.getScheduleExportPreview).not.toHaveBeenCalled();

  setOnline(true);
  act(() => {
    window.dispatchEvent(new Event('online'));
  });

  expect(await within(dialog).findAllByRole('img')).toHaveLength(2);
  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeEnabled();
});

it('says so when the preview cannot be rendered', async () => {
  state.getScheduleExportPreview.mockRejectedValue(new Error('boom'));
  const dialog = await openDialog();

  expect(
    await within(dialog).findByText(m.export_preview_failed()),
  ).toBeVisible();
});
