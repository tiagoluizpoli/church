import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/__tests__/setup/children-props';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSchedulingCapability = vi.fn();
const listPlanningCycles = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  schedulingCapabilitiesApi: {
    getSchedulingCapability: (...args: unknown[]) =>
      getSchedulingCapability(...args),
  },
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
  },
  activeChurchApi: (await import('@/__tests__/setup/active-church'))
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
  getSchedulingCapability.mockReset();
  listPlanningCycles.mockReset();
  listPlanningCycles.mockResolvedValue({ cycles: [] });
  getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('Scheduling capability index route', () => {
  it('renders capability-backed Church and Ministry entries', async () => {
    getSchedulingCapability.mockResolvedValue({
      canAccessScheduling: true,
      entries: [
        { kind: 'church' },
        {
          kind: 'ministry',
          ministryId: '11111111-1111-4111-8111-111111111111',
          name: 'Worship',
        },
      ],
    });

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', { name: 'Scheduling' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Open church planning' }),
    ).toHaveAttribute('href', '/scheduling/planning-cycles');
    expect(screen.getByRole('link', { name: 'Open Worship' })).toHaveAttribute(
      'href',
      '/scheduling/tailoring/11111111-1111-4111-8111-111111111111',
    );
  });

  it('groups Team roster entries under their Ministry', async () => {
    getSchedulingCapability.mockResolvedValue({
      canAccessScheduling: true,
      entries: [
        {
          kind: 'team',
          ministryId: '11111111-1111-4111-8111-111111111111',
          ministryName: 'Worship',
          teamId: '22222222-2222-4222-8222-222222222222',
          name: 'Greeting',
        },
      ],
    });

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', { name: 'Worship' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Greeting roster' }),
    ).toHaveAttribute(
      'href',
      '/scheduling/rostering/11111111-1111-4111-8111-111111111111?teamId=22222222-2222-4222-8222-222222222222',
    );
  });

  it('keeps entry links hidden while the capability projection resolves', async () => {
    getSchedulingCapability.mockReturnValue(new Promise(() => {}));

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(await screen.findByLabelText('Loading Scheduling')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open church planning' }),
    ).not.toBeInTheDocument();
  });

  it('shows an honest empty state when the projection grants no entries', async () => {
    getSchedulingCapability.mockResolvedValue({
      canAccessScheduling: false,
      entries: [],
    });

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(
      await screen.findByText('No Scheduling work is available'),
    ).toBeVisible();
  });

  it('does not mistake a failed capability request for an empty projection', async () => {
    getSchedulingCapability
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ canAccessScheduling: false, entries: [] });
    const user = userEvent.setup();

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(await screen.findByText("Couldn't load Scheduling")).toBeVisible();
    expect(
      screen.queryByText('No Scheduling work is available'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('No Scheduling work is available'),
    ).toBeVisible();
  });
});
