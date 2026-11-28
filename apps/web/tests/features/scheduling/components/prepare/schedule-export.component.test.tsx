import { m } from '@church/i18n/messages';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  },
}));
vi.mock('@tanstack/react-router', () => ({ Link: () => null }));

const EXPORT_DATA: GetScheduleExportData200 = {
  ministry: { name: 'Worship' },
  cycle: { name: 'Março 2027', startDate: '2027-01-01', endDate: '2027-01-31' },
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
const downloads: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  downloads.length = 0;
  state.data = {
    ...SCHEDULE,
    stage: 'published',
    cycle: { ...SCHEDULE.cycle, name: 'Março: 2027' },
  };
  state.getScheduleExportFile.mockResolvedValue(pdf);
  state.getScheduleExportData.mockResolvedValue(EXPORT_DATA);
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
