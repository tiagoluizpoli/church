import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const listMinistries = vi.fn();
const listPlanningCycles = vi.fn();
const listEvents = vi.fn();
const getCycleParticipation = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEvents: (...args: unknown[]) => listEvents(...args),
    getCycleParticipation: (...args: unknown[]) =>
      getCycleParticipation(...args),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderTailoringIndex() {
  return renderRoute({ initialPath: '/scheduling/tailoring' });
}

describe('Tailoring ministry list route (US1/T013)', () => {
  it('fetches ministries + locked-cycle scoping and renders aggregated counts', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    listPlanningCycles.mockResolvedValue({
      cycles: [{ id: 'cycle-1', name: 'August', state: 'locked' }],
    });
    listEvents.mockResolvedValue({
      events: [{ id: 'event-1', planningCycleId: 'cycle-1' }],
    });
    getCycleParticipation.mockResolvedValue({
      events: [{ slots: [{}, {}] }],
    });

    renderTailoringIndex();

    const table = await screen.findByRole('grid', { name: 'Ministries' });
    expect(table).toHaveTextContent('Greeters');
    expect(table).toHaveTextContent('2');
  });

  it('navigates to the ministry route when a row is selected', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });
    listEvents.mockResolvedValue({ events: [] });

    const user = userEvent.setup();
    const { router } = renderTailoringIndex();

    const row = await screen.findByRole('row', { name: /Greeters/ });
    await user.click(row);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1',
      ),
    );
  });
});

describe('Tailoring ministry list route — permission failure (US1/T013a)', () => {
  it('renders a permission-denied state instead of crashing on a 403', async () => {
    listMinistries.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderTailoringIndex();

    expect(
      await screen.findByTestId('tailoring-forbidden-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});

describe('Tailoring ministry list route — network/server failure (US1/T013b)', () => {
  it('renders a retryable error state, not an infinite spinner, on a network error', async () => {
    listMinistries.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderTailoringIndex();

    expect(
      await screen.findByTestId('tailoring-retryable-error-state'),
    ).toBeInTheDocument();
  });

  it('retries the failed fetch when the Retry button is clicked', async () => {
    listMinistries
      .mockRejectedValueOnce({ isAxiosError: true, message: 'Network Error' })
      .mockResolvedValue({ ministries: [] });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    renderTailoringIndex();

    await screen.findByTestId('tailoring-retryable-error-state');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        screen.queryByTestId('tailoring-retryable-error-state'),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByTestId('ministry-tailoring-empty-state'),
    ).toBeInTheDocument();
  });
});
