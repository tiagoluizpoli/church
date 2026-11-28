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
const cardImage = new Blob(['PNG'], { type: 'image/png' });
const downloads: string[] = [];
const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
const notFound = new AxiosError('Not Found', '404', undefined, undefined, {
  status: 404,
} as never);

interface FileParams {
  format: string;
  layout?: string;
  page?: number;
}

/** Pages a file has: two A4 pages, `cards` card images, one table image. */
function pageCount({ format, layout }: FileParams, cards: number) {
  if (layout === 'cards') return cards;
  return format === 'pdf' ? 2 : 1;
}

/** The server's preview and files, 404 past the last page or image. */
function servePages({ cards = 2 } = {}) {
  state.getScheduleExportPreview.mockImplementation(
    (_ministryId: string, _cycleId: string, params: FileParams) =>
      (params.page ?? 1) <= pageCount(params, cards)
        ? Promise.resolve(svg)
        : Promise.reject(notFound),
  );
  state.getScheduleExportFile.mockImplementation(
    (_ministryId: string, _cycleId: string, params: FileParams) => {
      if (params.layout !== 'cards') return Promise.resolve(pdf);
      return (params.page ?? 1) <= cards
        ? Promise.resolve(cardImage)
        : Promise.reject(notFound);
    },
  );
}

function fileCalls() {
  return state.getScheduleExportFile.mock.calls.map(([, , params]) => params);
}

function chooseFormat(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole('radio', { name }));
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
  state.getScheduleExportData.mockResolvedValue(EXPORT_DATA);
  servePages();
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
  chooseFormat(dialog, m.export_format_pdf());

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

it('keeps the dialog open and says so when the download fails', async () => {
  state.getScheduleExportFile.mockRejectedValue(new Error('offline'));
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);

  fireEvent.click(screen.getByRole('button', { name: m.export_open() }));
  await waitForDialogFocus();
  await clickDownload(
    screen.getByRole('dialog', { name: m.export_dialog_title() }),
  );

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

it('opens on Imagem em cartões and downloads every card image, numbered', async () => {
  servePages({ cards: 2 });
  const dialog = await openDialog();

  expect(
    within(dialog).getByRole('radio', { name: m.export_format_cards() }),
  ).toBeChecked();
  await clickDownload(dialog);

  const name = m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' });
  await waitFor(() =>
    expect(downloads).toEqual([
      `${name} - ${m.export_image_part({ part: '1', parts: '2' })}.png`,
      `${name} - ${m.export_image_part({ part: '2', parts: '2' })}.png`,
    ]),
  );
  expect(fileCalls()).toEqual([
    { format: 'png', layout: 'cards', page: 1 },
    { format: 'png', layout: 'cards', page: 2 },
    { format: 'png', layout: 'cards', page: 3 },
  ]);
  expect(URL.createObjectURL).toHaveBeenCalledWith(cardImage);
});

it('names a single card image without a part number', async () => {
  servePages({ cards: 1 });
  const dialog = await openDialog();

  await clickDownload(dialog);

  await waitFor(() =>
    expect(downloads).toEqual([
      `${m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' })}.png`,
    ]),
  );
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

  const name = m.export_file_name({ ministry: 'Worship', cycle: 'Março 2027' });
  await waitFor(() =>
    expect(downloads).toEqual([
      `${name} - ${m.export_draft()} - ${m.export_image_part({ part: '1', parts: '2' })}.png`,
      `${name} - ${m.export_draft()} - ${m.export_image_part({ part: '2', parts: '2' })}.png`,
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
    { format: 'png', layout: 'cards', page: 1 },
    { format: 'png', layout: 'cards', page: 2 },
    { format: 'png', layout: 'cards', page: 3 },
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
  await clickDownload(dialog);

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
      format: 'png',
      layout: 'cards',
      page: 1,
      from: '2027-01-01',
      to: '2027-01-31',
    }),
  );
});
