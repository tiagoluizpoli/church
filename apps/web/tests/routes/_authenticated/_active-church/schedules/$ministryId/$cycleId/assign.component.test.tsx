import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCycle = vi.fn();
const getCycleBuilderData = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    getCycle: (...args: unknown[]) => getCycle(...args),
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
  getCycle.mockResolvedValue({
    cycle: {
      id: 'cycle-1',
      churchId: 'church-1',
      name: 'August 2026',
      startDate: '2026-07-10T00:00:00',
      endDate: '2026-07-12T00:00:00',
      state: 'sent',
      createdAt: '2026-07-01T00:00:00',
      updatedAt: '2026-07-01T00:00:00',
    },
    events: [],
  });
  getCycleBuilderData.mockResolvedValue({ roles: [], events: [] });
});

describe('Assign board route', () => {
  it('renders the board as its own page, without the Prepare workspace', async () => {
    renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign',
      churchTimezone: 'UTC',
    });

    const board = await screen.findByTestId('event-builder-route');
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
