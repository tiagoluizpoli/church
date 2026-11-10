import { m } from '@church/i18n/messages';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCycleBuilderData = vi.fn();
const listMinistrySwapRequests = vi.fn();
const toastError = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    getCycleBuilderData: (...args: unknown[]) => getCycleBuilderData(...args),
    listMinistrySwapRequests: (...args: unknown[]) =>
      listMinistrySwapRequests(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

const swapRequest = {
  id: 'request-1',
  assignmentId: 'assignment-1',
  volunteerName: 'Grace Hopper',
  eventTitle: 'Sunday Gathering',
  roleName: 'Greeter',
  sectorName: 'Main',
  startsAt: '2030-08-02T09:00:00.000Z',
  endsAt: '2030-08-02T11:00:00.000Z',
  raisedAt: '2030-08-01T10:00:00.000Z',
  status: 'open',
};

beforeEach(() => {
  vi.clearAllMocks();
  listMinistrySwapRequests.mockResolvedValue({ schedules: [] });
  getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
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

  it('refetches on return while keeping the board visible', async () => {
    renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign',
      churchTimezone: 'UTC',
    });
    await screen.findByTestId('event-builder-route');
    let resolveRead: ((value: unknown) => void) | undefined;
    getCycleBuilderData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getCycleBuilderData).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('event-builder-route')).toBeVisible();
    await act(async () => {
      resolveRead?.({
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
    focusManager.setFocused(undefined);
  });

  it('opens the linked swap request sheet only after the leader list arrives', async () => {
    let resolveList: ((value: unknown) => void) | undefined;
    listMinistrySwapRequests.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    const { router } = renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign?swapRequest=request-1',
      churchTimezone: 'UTC',
    });

    await screen.findByTestId('event-builder-route');
    expect(screen.queryByTestId('swap-request-sheet')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    await act(async () => {
      resolveList?.({
        schedules: [
          { cycleId: 'cycle-1', openCount: 1, requests: [swapRequest] },
        ],
      });
    });

    expect(await screen.findByTestId('swap-request-sheet')).toBeVisible();
    expect(screen.getByText('Grace Hopper')).toBeVisible();
    expect(listMinistrySwapRequests).toHaveBeenCalledWith('ministry-1', {
      cycleId: 'cycle-1',
    });
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('keeps the board and says so for an unknown or closed swap request id', async () => {
    renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign?swapRequest=gone',
      churchTimezone: 'UTC',
    });

    await screen.findByTestId('event-builder-route');
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(m.swap_board_unavailable()),
    );
    expect(screen.queryByTestId('swap-request-sheet')).not.toBeInTheDocument();
  });

  it('keeps the board and says so when the leader list cannot be read', async () => {
    listMinistrySwapRequests.mockRejectedValue(
      new AxiosError('Not found', undefined, undefined, undefined, {
        status: 404,
      } as AxiosResponse),
    );
    renderRoute({
      initialPath: '/schedules/ministry-1/cycle-1/assign?swapRequest=request-1',
      churchTimezone: 'UTC',
    });

    expect(await screen.findByTestId('event-builder-route')).toBeVisible();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(m.swap_board_unavailable()),
    );
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

it.each([
  'Volunteer',
  'TeamLeader',
])('shows the no-access page for a %s receiving 403', async () => {
  getCycleBuilderData.mockRejectedValue(
    new AxiosError('Forbidden', undefined, undefined, undefined, {
      status: 403,
    } as AxiosResponse),
  );
  const { router } = renderRoute({
    initialPath: '/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  expect(await screen.findByText(m.no_access_title())).toBeVisible();
  expect(router.state.location.pathname).toBe('/no-access');
});

it('shows indistinguishable not found for a foreign Ministry leader receiving 404', async () => {
  getCycleBuilderData.mockRejectedValue(
    new AxiosError('Secret ministry name', undefined, undefined, undefined, {
      status: 404,
    } as AxiosResponse),
  );
  const { router } = renderRoute({
    initialPath: '/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  expect(await screen.findByText('Not Found')).toBeVisible();
  expect(screen.queryByText('Secret ministry name')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe(
    '/schedules/ministry-1/cycle-1/assign',
  );
});

it('preserves the assign destination when signed out', async () => {
  getSession.mockResolvedValue({ data: null });
  const path = '/schedules/ministry-1/cycle-1/assign';
  const { router } = renderRoute({ initialPath: path, churchTimezone: 'UTC' });
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toEqual({ redirect: path });
});

it('preserves the assign destination when the board read returns 401', async () => {
  getSession
    .mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    .mockResolvedValue({ data: null });
  getCycleBuilderData.mockRejectedValue(
    new AxiosError('Signed out', undefined, undefined, undefined, {
      status: 401,
    } as AxiosResponse),
  );
  const path = '/schedules/ministry-1/cycle-1/assign';
  const { router } = renderRoute({ initialPath: path, churchTimezone: 'UTC' });
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toEqual({ redirect: path });
});

it('preserves the current board destination when the session expires after switching boards', async () => {
  const { router } = renderRoute({
    initialPath: '/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  await screen.findByTestId('event-builder-route');
  getCycleBuilderData.mockImplementationOnce(() => {
    getSession.mockResolvedValue({ data: null });
    return Promise.reject(
      new AxiosError('Signed out', undefined, undefined, undefined, {
        status: 401,
      } as AxiosResponse),
    );
  });
  const path = '/schedules/ministry-2/cycle-2/assign';
  await act(async () => {
    await router.navigate({
      to: '/schedules/$ministryId/$cycleId/assign',
      params: { ministryId: 'ministry-2', cycleId: 'cycle-2' },
    });
  });
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toEqual({ redirect: path });
});
