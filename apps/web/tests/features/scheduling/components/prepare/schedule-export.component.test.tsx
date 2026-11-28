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
import type {
  GetSchedule200,
  GetScheduleExportData200,
} from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getScheduleExportFile: vi.fn(),
  getScheduleExportData: vi.fn(),
  getScheduleExportPreview: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getEventGroups: async () => ({
      groups: [],
      catchAllName: null,
      templates: [],
    }),
  },
  exportApi: {
    getScheduleExportFile: state.getScheduleExportFile,
    getScheduleExportData: state.getScheduleExportData,
    getScheduleExportPreview: state.getScheduleExportPreview,
  },
}));
vi.mock('@tanstack/react-router', () => ({ Link: () => null }));

const EXPORT_DATA: GetScheduleExportData200 = {
  ministry: { name: 'Worship' },
  cycle: { name: 'Março 2027', startDate: '2027-01-01', endDate: '2027-01-31' },
  range: { from: '2027-01-01', to: '2027-01-31' },
  isDraft: false,
  hasUnsentChanges: false,
  singleSector: null,
  singleRole: null,
  duplicateNames: [],
  parts: [],
};

/** Baixar turns on once the export data has loaded. */
async function clickDownload(dialog: HTMLElement) {
  const button = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
const png = new Blob(['PNG'], { type: 'image/png' });
const downloads: string[] = [];
const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
const notFound = new AxiosError('Not Found', '404', undefined, undefined, {
  status: 404,
} as never);

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

/** The server's files: one PDF, `images` table PNGs read by page until 404. */
function filePages({ images = 1 } = {}) {
  state.getScheduleExportFile.mockImplementation(
    (
      _ministryId: string,
      _cycleId: string,
      params: { format: string; page?: number },
    ) => {
      if (params.format === 'pdf') return Promise.resolve(pdf);
      return (params.page ?? 1) <= images
        ? Promise.resolve(png)
        : Promise.reject(notFound);
    },
  );
}

interface ShareSupport {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/** The device's Web Share support; jsdom has none. */
function setShare({ canShare, share }: ShareSupport) {
  for (const [key, value] of Object.entries({ canShare, share })) {
    Object.defineProperty(window.navigator, key, {
      configurable: true,
      value,
    });
  }
}

function fileCalls() {
  return state.getScheduleExportFile.mock.calls.map(([, , params]) => params);
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

beforeEach(() => {
  vi.resetAllMocks();
  downloads.length = 0;
  state.data = {
    ...SCHEDULE,
    stage: 'published',
    cycle: { ...SCHEDULE.cycle, name: 'Março: 2027' },
  };
  filePages();
  state.getScheduleExportData.mockResolvedValue(EXPORT_DATA);
  previewPages();
  setShare({});
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
  expect(within(dialog).getByText(m.export_format_pdf())).toBeVisible();

  await clickDownload(dialog);

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

it('says so and keeps Baixar off when the files cannot be fetched', async () => {
  state.getScheduleExportFile.mockRejectedValue(new Error('offline'));
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);

  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  const dialog = screen.getByRole('dialog', { name: m.export_dialog_title() });

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    m.export_download_failed(),
  );
  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
});

async function openDialog() {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  return screen.getByRole('dialog', { name: m.export_dialog_title() });
}

it('waits for the export data before Baixar turns on', async () => {
  state.getScheduleExportData.mockReturnValue(new Promise(() => {}));
  const dialog = await openDialog();

  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
});

it('shows no notice for a published Schedule with nothing unsent', async () => {
  const dialog = await openDialog();

  await waitFor(() =>
    expect(state.getScheduleExportData).toHaveBeenCalledExactlyOnceWith(
      'm',
      'c',
    ),
  );
  expect(within(dialog).queryByText(m.export_draft_notice())).toBeNull();
  expect(within(dialog).queryByText(m.export_unsent_changes())).toBeNull();
  expect(
    within(dialog).queryByText(m.export_duplicate_names_title()),
  ).toBeNull();
});

it('says a never-published Schedule downloads as a Rascunho', async () => {
  state.getScheduleExportData.mockResolvedValue({
    ...EXPORT_DATA,
    isDraft: true,
  });
  const dialog = await openDialog();

  expect(
    await within(dialog).findByText(m.export_draft_notice()),
  ).toBeVisible();
  expect(within(dialog).queryByText(m.export_unsent_changes())).toBeNull();
  await clickDownload(dialog);

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })} - ${m.export_draft()}.pdf`,
    ]),
  );
});

it('hints at changes not yet sent to the volunteers', async () => {
  state.getScheduleExportData.mockResolvedValue({
    ...EXPORT_DATA,
    hasUnsentChanges: true,
  });
  const dialog = await openDialog();

  expect(
    await within(dialog).findByText(m.export_unsent_changes()),
  ).toBeVisible();
  expect(within(dialog).queryByText(m.export_draft_notice())).toBeNull();
});

it('flags volunteers with the same name, names as registered', async () => {
  state.getScheduleExportData.mockResolvedValue({
    ...EXPORT_DATA,
    duplicateNames: [
      ['Ana Souza', 'Ána  Souza'],
      ['Bruno Lima', 'bruno lima'],
    ],
  });
  const dialog = await openDialog();

  const notice = (
    await within(dialog).findByText(m.export_duplicate_names_title())
  ).closest('[role="status"]') as HTMLElement;
  expect(notice).toBeVisible();
  const items = within(notice)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  expect(items).toEqual(['Ana Souza · Ána  Souza', 'Bruno Lima · bruno lima']);
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
  const dialog = await openDialog();

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );
  await clickDownload(dialog);

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })}.png`,
    ]),
  );
  // The PDF was prefetched first, before the format changed.
  expect(fileCalls()).toEqual([
    { format: 'pdf' },
    { format: 'png', page: 1 },
    { format: 'png', page: 2 },
  ]);
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
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: m.export_download() }),
    ).toBeEnabled(),
  );
});

it('says so when the preview cannot be rendered', async () => {
  state.getScheduleExportPreview.mockRejectedValue(new Error('boom'));
  const dialog = await openDialog();

  expect(
    await within(dialog).findByText(m.export_preview_failed()),
  ).toBeVisible();
});

it('previews only the chosen dates', async () => {
  const dialog = await openDialog();
  await within(dialog).findAllByRole('img');

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_pick_dates() }),
  );

  await waitFor(() =>
    expect(previewCalls()).toContainEqual({
      format: 'pdf',
      page: 1,
      from: '2027-01-01',
      to: '2027-01-31',
    }),
  );
});

interface Deferred {
  promise: Promise<Blob>;
  resolve: (value: Blob) => void;
}

function deferred(): Deferred {
  let resolve: (value: Blob) => void = () => {};
  const promise = new Promise<Blob>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function footerSummary(dialog: HTMLElement) {
  return within(dialog).queryByText(/ · /, {
    selector: '[data-export-summary]',
  });
}

it('fetches the files once the preview settles and turns Baixar on when they are ready', async () => {
  const preview = deferred();
  const file = deferred();
  state.getScheduleExportPreview.mockReturnValueOnce(preview.promise);
  state.getScheduleExportFile.mockReturnValueOnce(file.promise);
  setShare({ canShare: () => true, share: vi.fn() });
  const dialog = await openDialog();
  const download = within(dialog).getByRole('button', {
    name: m.export_download(),
  });
  const share = within(dialog).getByRole('button', { name: m.export_share() });

  await waitFor(() =>
    expect(state.getScheduleExportPreview).toHaveBeenCalled(),
  );
  expect(state.getScheduleExportFile).not.toHaveBeenCalled();
  preview.resolve(svg);
  await waitFor(() => expect(fileCalls()).toEqual([{ format: 'pdf' }]));
  expect(download).toBeDisabled();
  expect(share).toBeDisabled();

  file.resolve(pdf);
  await waitFor(() => expect(download).toBeEnabled());
  expect(share).toBeEnabled();
});

it('fetches the files again only once the changed preview settles', async () => {
  const dialog = await openDialog();
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: m.export_download() }),
    ).toBeEnabled(),
  );

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );

  expect(
    within(dialog).getByRole('button', { name: m.export_download() }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(fileCalls()).toEqual([
      { format: 'pdf' },
      { format: 'png', page: 1 },
      { format: 'png', page: 2 },
    ]),
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: m.export_download() }),
    ).toBeEnabled(),
  );
});

it('shows Compartilhar only where the device can share the files', async () => {
  const canShare = vi.fn((data: ShareData) =>
    (data.files ?? []).every((file) => file.type === 'application/pdf'),
  );
  setShare({ canShare, share: vi.fn() });
  const dialog = await openDialog();

  expect(
    within(dialog).getByRole('button', { name: m.export_share() }),
  ).toBeVisible();
  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );
  expect(
    within(dialog).queryByRole('button', { name: m.export_share() }),
  ).toBeNull();
});

it('shows no Compartilhar on a device without Web Share', async () => {
  const dialog = await openDialog();
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: m.export_download() }),
    ).toBeEnabled(),
  );

  expect(
    within(dialog).queryByRole('button', { name: m.export_share() }),
  ).toBeNull();
});

async function shareButton(dialog: HTMLElement) {
  const button = within(dialog).getByRole('button', { name: m.export_share() });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

it('shares every image in one call, each named as a part', async () => {
  filePages({ images: 2 });
  const share = vi.fn(() => Promise.resolve());
  setShare({ canShare: () => true, share });
  const dialog = await openDialog();
  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );

  fireEvent.click(await shareButton(dialog));

  expect(share).toHaveBeenCalledTimes(1);
  const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
  const name = m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' });
  expect(files.map((file) => [file.name, file.type])).toEqual([
    [
      `${name} - ${m.export_file_part({ part: '1', count: '2' })}.png`,
      'image/png',
    ],
    [
      `${name} - ${m.export_file_part({ part: '2', count: '2' })}.png`,
      'image/png',
    ],
  ]);
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: m.export_dialog_title() }),
    ).not.toBeInTheDocument(),
  );
});

it('shares the PDF as application/pdf', async () => {
  const share = vi.fn(() => Promise.resolve());
  setShare({ canShare: () => true, share });
  const dialog = await openDialog();

  fireEvent.click(await shareButton(dialog));

  const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
  expect(files.map((file) => [file.name, file.type])).toEqual([
    [
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })}.pdf`,
      'application/pdf',
    ],
  ]);
});

it('stays open, quietly, when the leader closes the share sheet', async () => {
  const share = vi.fn(() =>
    Promise.reject(new DOMException('cancelled', 'AbortError')),
  );
  setShare({ canShare: () => true, share });
  const dialog = await openDialog();

  fireEvent.click(await shareButton(dialog));

  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  await act(() => Promise.resolve());
  expect(state.toastError).not.toHaveBeenCalled();
  expect(dialog).toBeVisible();
});

it('says so when sharing fails', async () => {
  const share = vi.fn(() => Promise.reject(new Error('denied')));
  setShare({ canShare: () => true, share });
  const dialog = await openDialog();

  fireEvent.click(await shareButton(dialog));

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledExactlyOnceWith(
      m.export_share_failed(),
    ),
  );
  expect(dialog).toBeVisible();
});

it('downloads every image, each named as a part', async () => {
  filePages({ images: 2 });
  const dialog = await openDialog();
  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );

  await clickDownload(dialog);

  const name = m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' });
  await waitFor(() =>
    expect(downloads).toEqual([
      `${name} - ${m.export_file_part({ part: '1', count: '2' })}.png`,
      `${name} - ${m.export_file_part({ part: '2', count: '2' })}.png`,
    ]),
  );
});

it('sums up the files in the footer: count, format and span', async () => {
  filePages({ images: 2 });
  const dialog = await openDialog();

  await waitFor(() =>
    expect(footerSummary(dialog)).toHaveTextContent(
      m.export_summary({
        files: m.export_files_one(),
        format: m.export_format_pdf(),
        span: '01/01/2027 – 31/01/2027',
      }),
    ),
  );

  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_format_table_image() }),
  );
  fireEvent.click(
    within(dialog).getByRole('radio', { name: m.export_pick_dates() }),
  );
  expect(footerSummary(dialog)).toBeNull();
  await waitFor(() =>
    expect(footerSummary(dialog)).toHaveTextContent(
      m.export_summary({
        files: m.export_files_other({ count: '2' }),
        format: m.export_format_table_image(),
        span: '01/01/2027 – 31/01/2027',
      }),
    ),
  );
});
