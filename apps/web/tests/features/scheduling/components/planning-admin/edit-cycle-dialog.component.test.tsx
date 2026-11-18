import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditCycleDialog } from '@/features/scheduling/components/planning-admin/edit-cycle-dialog';
import { renderWithProviders } from '@/tests/setup/render';

const updateCycle = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: { updateCycle: (...args: unknown[]) => updateCycle(...args) },
}));
// The real picker is covered by its own component test.
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

const CYCLE = {
  id: 'cycle-1',
  name: 'Retiro de outubro',
  startDate: '2026-10-12',
  endDate: '2026-10-25',
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <EditCycleDialog open={open} onOpenChange={setOpen} cycle={CYCLE} />
    </>
  );
}

async function openDialog(queryClient = new QueryClient()) {
  const user = userEvent.setup();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderWithProviders(<Harness />, {
    queryClient,
    churchTimezone: 'America/Sao_Paulo',
  });
  await user.click(screen.getByRole('button', { name: 'open' }));
  return { user, invalidate, dialog: await screen.findByRole('dialog') };
}

function setDate({ testId, date }: { testId: string; date: string }) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: date } });
}

function refusal(data: Record<string, unknown>) {
  const error = new AxiosError('conflict');
  error.response = { status: 409, data } as AxiosResponse;
  return error;
}

beforeEach(() => {
  updateCycle.mockReset();
});
afterEach(() => overwriteGetLocale(() => 'pt-BR'));

describe('EditCycleDialog', () => {
  it('opens the Cycle form prefilled and saves unchanged dates, refreshing list and detail', async () => {
    updateCycle.mockResolvedValue(CYCLE);
    const { user, invalidate, dialog } = await openDialog();

    expect(
      within(dialog).getByText(m.cycles_form_title_edit()),
    ).toBeInTheDocument();
    expect(screen.getByTestId('cycle-name-input')).toHaveValue(
      'Retiro de outubro',
    );
    expect(screen.getByTestId('cycle-start-date-input')).toHaveValue(
      '2026-10-12',
    );
    expect(screen.getByTestId('cycle-end-date-input')).toHaveValue(
      '2026-10-25',
    );

    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updateCycle).toHaveBeenCalledWith('cycle-1', {
      name: 'Retiro de outubro',
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cycles'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-1'],
    });
  });

  it('keeps the authored name when a date changes and sends the trimmed rename', async () => {
    updateCycle.mockResolvedValue(CYCLE);
    const { user } = await openDialog();
    const name = screen.getByTestId('cycle-name-input');

    setDate({ testId: 'cycle-start-date-input', date: '2026-09-28' });
    expect(name).toHaveValue('Retiro de outubro');
    await user.clear(name);
    await user.type(name, '  Retiro  ');
    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    await waitFor(() =>
      expect(updateCycle).toHaveBeenCalledWith('cycle-1', {
        name: 'Retiro',
        startDate: '2026-09-28',
        endDate: '2026-10-25',
      }),
    );
  });

  it('names every Event a shrink would exclude, keeping the input for a retry', async () => {
    updateCycle
      .mockRejectedValueOnce(
        refusal({
          error: 'EVENT_OUTSIDE_CYCLE',
          message: m.error_event_outside_cycle(),
          outsideEvents: [
            {
              id: 'e1',
              title: 'Abertura',
              start: '2026-10-12T22:00:00.000Z',
              end: '2026-10-13T00:00:00.000Z',
            },
            {
              id: 'e2',
              title: 'Vigília',
              start: '2026-10-25T22:00:00.000Z',
              end: '2026-10-26T22:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(CYCLE);
    const { user } = await openDialog();

    setDate({ testId: 'cycle-start-date-input', date: '2026-10-13' });
    setDate({ testId: 'cycle-end-date-input', date: '2026-10-24' });
    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    const error = await screen.findByTestId('cycle-create-error');
    expect(error).toHaveTextContent(m.cycles_form_outside_events());
    // Church-local São Paulo times, not UTC.
    expect(error).toHaveTextContent('Abertura (12/10/2026 19:00 – 21:00)');
    expect(error).toHaveTextContent(
      'Vigília (25/10/2026 19:00 – 26/10/2026 19:00)',
    );
    expect(screen.getByTestId('cycle-end-date-input')).toHaveValue(
      '2026-10-24',
    );

    setDate({ testId: 'cycle-end-date-input', date: '2026-10-25' });
    setDate({ testId: 'cycle-start-date-input', date: '2026-10-12' });
    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('names the overlapping Cycle in English', async () => {
    overwriteGetLocale(() => 'en');
    updateCycle.mockImplementation(async () => {
      throw refusal({
        error: 'OVERLAPPING_CYCLE',
        message: m.error_overlapping_cycle(),
        conflictingCycles: [
          {
            id: 'c2',
            name: 'November',
            startDate: '2026-11-01',
            endDate: '2026-11-30',
          },
        ],
      });
    });
    const { user } = await openDialog();

    setDate({ testId: 'cycle-end-date-input', date: '2026-11-02' });
    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    const error = await screen.findByTestId('cycle-create-error');
    expect(error).toHaveTextContent(
      'Conflicts with November (01/11/2026 – 30/11/2026).',
    );
    expect(m.cycles_form_outside_events({}, { locale: 'en' })).toBe(
      'Events that would start outside these dates:',
    );
  });

  it('refreshes the stale Cycle after a state refusal', async () => {
    updateCycle.mockImplementation(async () => {
      throw refusal({
        error: 'ILLEGAL_STATE_TRANSITION',
        message: m.error_illegal_state_transition(),
      });
    });
    const { user, invalidate } = await openDialog();

    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    expect(await screen.findByTestId('cycle-create-error')).toHaveTextContent(
      m.error_illegal_state_transition(),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-1'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cycles'] });
  });

  it('cancels without a mutation', async () => {
    const { user } = await openDialog();

    await user.click(
      screen.getByRole('button', { name: m.cycles_form_cancel() }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updateCycle).not.toHaveBeenCalled();
  });

  it('sends one request while a save is pending', async () => {
    updateCycle.mockReturnValue(new Promise(() => undefined));
    const { user } = await openDialog();

    await user.click(
      screen.getByRole('button', { name: m.cycles_form_submit_edit() }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('create-cycle-button')).toBeDisabled(),
    );
    await user.click(screen.getByTestId('create-cycle-button'));
    expect(updateCycle).toHaveBeenCalledTimes(1);
  });
});
