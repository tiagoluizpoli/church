import { m } from '@church/i18n/messages';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type { GetSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getScheduleExportFile: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  exportApi: { getScheduleExportFile: state.getScheduleExportFile },
}));

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
