import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const listEvents = vi.fn();
const listPlanningCycles = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listEvents: (...args: unknown[]) => listEvents(...args),
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
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

function renderMinistryCycleList() {
  return renderRoute({ initialPath: '/scheduling/tailoring/ministry-1' });
}

describe('Tailoring ministry cycle-list route (US2/T015a)', () => {
  it('redirects straight to the workspace when exactly one cycle is open', async () => {
    listEvents.mockResolvedValue({
      events: [
        {
          id: 'event-1',
          planningCycleId: 'cycle-1',
          title: 'August',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
      ],
    });
    listPlanningCycles.mockResolvedValue({
      cycles: [{ id: 'cycle-1', name: 'August', state: 'locked' }],
    });

    const { router } = renderMinistryCycleList();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1/cycle-1',
      ),
    );
  });

  it('renders the picker normally when 2+ cycles are open', async () => {
    listEvents.mockResolvedValue({
      events: [
        {
          id: 'event-1',
          planningCycleId: 'cycle-1',
          title: 'August',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
        {
          id: 'event-2',
          planningCycleId: 'cycle-2',
          title: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        },
      ],
    });
    listPlanningCycles.mockResolvedValue({
      cycles: [
        { id: 'cycle-1', name: 'August', state: 'locked' },
        { id: 'cycle-2', name: 'September', state: 'locked' },
      ],
    });

    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
  });

  it('navigates to the selected cycle workspace when a row is clicked', async () => {
    listEvents.mockResolvedValue({
      events: [
        {
          id: 'event-1',
          planningCycleId: 'cycle-1',
          title: 'August',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
        {
          id: 'event-2',
          planningCycleId: 'cycle-2',
          title: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        },
      ],
    });
    listPlanningCycles.mockResolvedValue({
      cycles: [
        { id: 'cycle-1', name: 'August', state: 'locked' },
        { id: 'cycle-2', name: 'September', state: 'locked' },
      ],
    });

    const user = userEvent.setup();
    const { router } = renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });
    await user.click(screen.getByRole('row', { name: /September/ }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1/cycle-2',
      ),
    );
  });
});

describe('Tailoring ministry cycle-list route — permission failure (US2/T015b)', () => {
  it('renders a permission-denied state on a 403, not a crash', async () => {
    listEvents.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderMinistryCycleList();

    expect(
      await screen.findByTestId('tailoring-forbidden-state'),
    ).toBeInTheDocument();
  });
});

describe('Tailoring ministry cycle-list route — network failure (US2/T015c)', () => {
  it('renders a retryable error state, not a crash or infinite spinner', async () => {
    listEvents.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderMinistryCycleList();

    expect(
      await screen.findByTestId('tailoring-retryable-error-state'),
    ).toBeInTheDocument();
  });
});
