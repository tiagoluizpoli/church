import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const listMinistries = vi.fn();
const listCycles = vi.fn();
const listEvents = vi.fn();
const getCycleParticipation = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEvents: (...args: unknown[]) => listEvents(...args),
    getCycleParticipation: (...args: unknown[]) =>
      getCycleParticipation(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderPrepareIndex() {
  return renderRoute({
    initialPath: '/schedules',
    churchTimezone: 'UTC',
  });
}

describe('Prepare ministry list route (US1/T013)', () => {
  it('fetches ministries + sent-cycle scoping and renders aggregated counts', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    listCycles.mockResolvedValue({
      cycles: [{ id: 'cycle-1', name: 'August', state: 'sent' }],
    });
    listEvents.mockResolvedValue({
      events: [{ id: 'event-1', cycleId: 'cycle-1' }],
    });
    getCycleParticipation.mockResolvedValue({
      events: [{ eventTimeBlocks: [{}, {}] }],
    });

    renderPrepareIndex();

    const table = await screen.findByRole('grid', { name: 'Ministries' });
    expect(table).toHaveTextContent('Greeters');
    expect(table).toHaveTextContent('2');
  });

  it('renders header stat pills for ministry/event/time block totals', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    listCycles.mockResolvedValue({
      cycles: [{ id: 'cycle-1', name: 'August', state: 'sent' }],
    });
    listEvents.mockResolvedValue({
      events: [{ id: 'event-1', cycleId: 'cycle-1' }],
    });
    getCycleParticipation.mockResolvedValue({
      events: [{ eventTimeBlocks: [{}, {}] }],
    });

    renderPrepareIndex();

    await screen.findByRole('grid', { name: 'Ministries' });
    expect(screen.getByTestId('prepare-ministry-count')).toHaveTextContent('1');
    expect(
      screen.getByTestId('prepare-ministry-event-total'),
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('prepare-ministry-event-time-block-total'),
    ).toHaveTextContent('2');
  });

  it('navigates to the ministry route when the Prepare button is activated', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    listCycles.mockResolvedValue({ cycles: [] });
    listEvents.mockResolvedValue({ events: [] });

    const user = userEvent.setup();
    const { router } = renderPrepareIndex();

    await screen.findByRole('grid', { name: 'Ministries' });
    const buttons = screen.getAllByTestId('ministry-prepare-button-ministry-1');
    await user.click(buttons[0]);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/schedules/ministry-1'),
    );
  });
});

describe('Prepare ministry list route — permission failure (US1/T013a)', () => {
  it('renders a permission-denied state instead of crashing on a 403', async () => {
    listMinistries.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });
    listCycles.mockResolvedValue({ cycles: [] });

    renderPrepareIndex();

    expect(
      await screen.findByTestId('prepare-forbidden-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});

describe('Prepare ministry list route — network/server failure (US1/T013b)', () => {
  it('renders a retryable error state, not an infinite spinner, on a network error', async () => {
    listMinistries.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });
    listCycles.mockResolvedValue({ cycles: [] });

    renderPrepareIndex();

    expect(
      await screen.findByTestId('prepare-retryable-error-state'),
    ).toBeInTheDocument();
  });

  it('retries the failed fetch when the Retry button is clicked', async () => {
    listMinistries
      .mockRejectedValueOnce({ isAxiosError: true, message: 'Network Error' })
      .mockResolvedValue({ ministries: [] });
    listCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    renderPrepareIndex();

    await screen.findByTestId('prepare-retryable-error-state');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        screen.queryByTestId('prepare-retryable-error-state'),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByTestId('ministry-prepare-empty-state'),
    ).toBeInTheDocument();
  });
});

describe('Cycle-ready picker entry (N2)', () => {
  const pickerPath =
    '/schedules?cycleId=cycle-9&ministryIds=ministry-1,ministry-3';

  it('lists only the named Ministries the caller still leads and keeps the Cycle on selection', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
        { id: 'ministry-2', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });
    renderRoute({
      initialPath: pickerPath,
      churchTimezone: 'UTC',
    });

    const open = await screen.findByRole('link', {
      name: m.prepare_cycle_picker_open({ ministryName: 'Greeters' }),
    });
    expect(screen.getByTestId('cycle-prepare-picker')).toHaveTextContent(
      m.prepare_cycle_picker_title(),
    );
    // Kids was not named; ministry-3 is no longer led.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(listCycles).not.toHaveBeenCalled();

    // The destination keeps the Cycle and checks access itself.
    expect(open).toHaveAttribute('href', '/schedules/ministry-1/cycle-9');
  });

  it('says so when the caller no longer leads any named Ministry', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-2', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });

    renderRoute({ initialPath: pickerPath, churchTimezone: 'UTC' });

    expect(
      await screen.findByText(m.prepare_cycle_picker_empty()),
    ).toBeVisible();
  });

  it('offers a retry after a failed load', async () => {
    listMinistries.mockRejectedValueOnce(new Error('network'));
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    const user = userEvent.setup();
    renderRoute({ initialPath: pickerPath, churchTimezone: 'UTC' });

    await user.click(
      await screen.findByRole('button', {
        name: m.prepare_cycle_picker_retry(),
      }),
    );

    expect(
      await screen.findByRole('link', {
        name: m.prepare_cycle_picker_open({ ministryName: 'Greeters' }),
      }),
    ).toBeVisible();
  });
});
