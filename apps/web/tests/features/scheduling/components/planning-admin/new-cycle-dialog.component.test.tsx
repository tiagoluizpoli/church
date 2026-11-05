import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCycleDialog } from '@/features/scheduling/components/planning-admin/new-cycle-dialog';
import { renderWithProviders } from '@/tests/setup/render';

const createCycle = vi.fn();
const navigate = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: { createCycle: (...args: unknown[]) => createCycle(...args) },
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
// The real picker is covered by its own component test; here a plain input
// keeps the form tests fast and independent of the calendar's locale labels.
vi.mock('@/components/date-picker-field', () => ({
  DatePickerField: ({
    id,
    value,
    onChange,
    'data-testid': testId,
  }: {
    id: string;
    value: string;
    onChange: (date: string) => void;
    'data-testid': string;
  }) => (
    <input
      id={id}
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <NewCycleDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

async function openDialog(queryClient?: QueryClient) {
  const user = userEvent.setup();
  renderWithProviders(<Harness />, { queryClient });
  await user.click(screen.getByRole('button', { name: 'open' }));
  return { user, dialog: await screen.findByRole('dialog') };
}

function setDate({ testId, date }: { testId: string; date: string }) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: date } });
}

function pickRange({ start, end }: { start: string; end: string }) {
  setDate({ testId: 'cycle-start-date-input', date: start });
  setDate({ testId: 'cycle-end-date-input', date: end });
}

function createdCycle(id = 'cycle-9') {
  return { id, name: 'x', startDate: '2026-10-12', endDate: '2026-10-25' };
}

beforeEach(() => {
  createCycle.mockReset();
  navigate.mockReset();
});
afterEach(() => overwriteGetLocale(() => 'pt-BR'));

describe('NewCycleDialog', () => {
  it('opens as plain dialog state with the submit disabled until the form is valid', async () => {
    const { dialog } = await openDialog();

    expect(
      within(dialog).getByText(m.cycles_form_title_new()),
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-cycle-button')).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('suggests the start month in pt-BR until the admin writes a name, then keeps theirs', async () => {
    const { user } = await openDialog();
    const name = screen.getByTestId('cycle-name-input');

    pickRange({ start: '2026-10-12', end: '2026-10-25' });
    expect(name).toHaveValue('Outubro 2026');

    await user.clear(name);
    await user.type(name, 'Retiro de jovens');
    setDate({ testId: 'cycle-start-date-input', date: '2026-10-20' });
    expect(name).toHaveValue('Retiro de jovens');
  });

  it('follows a start month change and the locale while the name is still a suggestion', async () => {
    overwriteGetLocale(() => 'en');
    await openDialog();
    const name = screen.getByTestId('cycle-name-input');

    pickRange({ start: '2026-10-12', end: '2026-10-25' });
    expect(name).toHaveValue('October 2026');

    setDate({ testId: 'cycle-start-date-input', date: '2026-09-01' });
    expect(name).toHaveValue('September 2026');
  });

  it('accepts a single-day Cycle and sends the trimmed name', async () => {
    createCycle.mockResolvedValue(createdCycle());
    const { user } = await openDialog();

    await user.type(screen.getByTestId('cycle-name-input'), '  Retiro  ');
    pickRange({ start: '2026-10-12', end: '2026-10-12' });
    await user.click(screen.getByTestId('create-cycle-button'));

    await waitFor(() =>
      expect(createCycle).toHaveBeenCalledWith({
        name: 'Retiro',
        startDate: '2026-10-12',
        endDate: '2026-10-12',
      }),
    );
  });

  it('shows reversed dates inline and blocks submission', async () => {
    await openDialog();

    pickRange({ start: '2026-10-25', end: '2026-10-12' });

    expect(screen.getByText(m.error_invalid_date_range())).toBeInTheDocument();
    expect(screen.getByTestId('create-cycle-button')).toBeDisabled();
  });

  it('refuses a name longer than 255 characters inline', async () => {
    const { user } = await openDialog();

    pickRange({ start: '2026-10-12', end: '2026-10-25' });
    const name = screen.getByTestId('cycle-name-input');
    await user.clear(name);
    await user.click(name);
    await user.paste('a'.repeat(256));

    expect(
      screen.getByText(m.cycles_form_name_too_long({ max: 255 })),
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-cycle-button')).toBeDisabled();
  });

  it('cancels without a mutation and returns focus to the opener', async () => {
    const { user } = await openDialog();

    await user.click(
      screen.getByRole('button', { name: m.cycles_form_cancel() }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createCycle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'open' })).toHaveFocus();
  });

  it('keeps the input on an overlap, names the conflicting Cycle, and retries to success', async () => {
    const overlap = new AxiosError('conflict');
    overlap.response = {
      status: 409,
      data: {
        error: 'OVERLAPPING_CYCLE',
        message: m.error_overlapping_cycle(),
        conflictingCycles: [
          {
            id: 'c1',
            name: 'Outubro 2026',
            startDate: '2026-10-01',
            endDate: '2026-10-31',
          },
        ],
      },
    } as AxiosResponse;
    createCycle
      .mockRejectedValueOnce(overlap)
      .mockResolvedValueOnce(createdCycle());
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { user } = await openDialog(queryClient);

    pickRange({ start: '2026-10-12', end: '2026-10-25' });
    await user.click(screen.getByTestId('create-cycle-button'));

    const error = await screen.findByTestId('cycle-create-error');
    expect(error).toHaveTextContent(m.error_overlapping_cycle());
    expect(error).toHaveTextContent('Outubro 2026');
    expect(error).toHaveTextContent('01/10/2026');
    expect(screen.getByTestId('cycle-name-input')).toHaveValue('Outubro 2026');
    expect(screen.getByTestId('cycle-end-date-input')).toHaveValue(
      '2026-10-25',
    );

    await user.click(screen.getByTestId('create-cycle-button'));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/cycles/$cycleId',
        params: { cycleId: 'cycle-9' },
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cycles'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-9'],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('disables submission while the request is pending', async () => {
    createCycle.mockReturnValue(new Promise(() => undefined));
    const { user } = await openDialog();

    pickRange({ start: '2026-10-12', end: '2026-10-25' });
    await user.click(screen.getByTestId('create-cycle-button'));

    await waitFor(() =>
      expect(screen.getByTestId('create-cycle-button')).toBeDisabled(),
    );
    expect(createCycle).toHaveBeenCalledTimes(1);
  });
});
