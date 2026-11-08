import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCycleBuilderData = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    getCycleBuilderData: (...args: unknown[]) => getCycleBuilderData(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  getCycleBuilderData.mockResolvedValue({
    cycle: {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    },
    roles: [],
    events: [],
  });
});

describe('Assign board route', () => {
  it('renders the board as its own page, without the Prepare workspace', async () => {
    renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign',
      churchTimezone: 'UTC',
    });

    const board = await screen.findByTestId('event-builder-route');
    expect(screen.getAllByText(/August 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText('10/07 – 12/07/2026')).toBeVisible();
    expect(board).toHaveAttribute('data-ministry-id', 'ministry-1');
    expect(board).toHaveAttribute('data-cycle-id', 'cycle-1');
    expect(
      screen.queryByTestId('prepare-workspace-page'),
    ).not.toBeInTheDocument();
  });

  it.each([
    '/scheduling/planning-cycles',
    '/scheduling/tailoring',
    '/scheduling/rostering/ministry-1/cycle-1',
  ])('leaves the retired path %s not found', async (path) => {
    renderRoute({ initialPath: path, churchTimezone: 'UTC' });

    expect(await screen.findByText('Not Found')).toBeVisible();
    expect(screen.queryByTestId('event-builder-route')).not.toBeInTheDocument();
  });
});
