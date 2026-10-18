import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listCycles = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
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
  getCallerCapabilities.mockReset();
  listCycles.mockReset();
  listCycles.mockResolvedValue({ cycles: [] });
  getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('Scheduling capability index route', () => {
  it('renders capability-backed Church and Ministry entries', async () => {
    getCallerCapabilities.mockResolvedValue({
      churchId: 'church-1',
      isChurchAdmin: true,
      ledMinistries: [
        { ministryId: '11111111-1111-4111-8111-111111111111', name: 'Worship' },
      ],
      hasVolunteerMembership: true,
    });

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', { name: 'Scheduling' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Open church planning' }),
    ).toHaveAttribute('href', '/cycles');
    expect(screen.getByRole('link', { name: 'Open Worship' })).toHaveAttribute(
      'href',
      '/schedules/11111111-1111-4111-8111-111111111111',
    );
  });

  it('keeps entry links hidden while the capability projection resolves', async () => {
    getCallerCapabilities.mockReturnValue(new Promise(() => {}));

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(await screen.findByLabelText('Loading Scheduling')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open church planning' }),
    ).not.toBeInTheDocument();
  });

  it('shows an honest empty state when the projection grants no entries', async () => {
    getCallerCapabilities.mockResolvedValue({
      churchId: 'church-1',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(
      await screen.findByText('No Scheduling work is available'),
    ).toBeVisible();
  });

  it('does not mistake a failed capability request for an empty projection', async () => {
    getCallerCapabilities
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({
        churchId: 'church-1',
        isChurchAdmin: false,
        ledMinistries: [],
        hasVolunteerMembership: false,
      });
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

  it('shows not-found for the retired Team schedule URL, with no redirect', async () => {
    getCallerCapabilities.mockResolvedValue({
      churchId: 'church-1',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const { router } = renderRoute({
      initialPath:
        '/scheduling/teams/11111111-1111-4111-8111-111111111111?teamId=22222222-2222-4222-8222-222222222222',
      churchTimezone: 'UTC',
    });

    expect(await screen.findByText('Not Found')).toBeVisible();
    expect(router.state.location.pathname).toBe(
      '/scheduling/teams/11111111-1111-4111-8111-111111111111',
    );
  });
});
