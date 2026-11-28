import { m } from '@church/i18n/messages';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCycleBuilderData = vi.fn();
const listMinistrySwapRequests = vi.fn();
const getSchedule = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const publishCycle = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    getCycleBuilderData: (...args: unknown[]) => getCycleBuilderData(...args),
    listMinistrySwapRequests: (...args: unknown[]) =>
      listMinistrySwapRequests(...args),
    getSchedule: (...args: unknown[]) => getSchedule(...args),
    publishCycle: (...args: unknown[]) => publishCycle(...args),
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
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
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
  getSchedule.mockResolvedValue(SCHEDULE);
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
  it('shows a busy skeleton, never an empty page, while the board loads', async () => {
    getCycleBuilderData.mockReturnValue(new Promise(() => {}));
    renderRoute({
      initialPath: '/app/schedules/ministry-1/cycle-1/assign',
      churchTimezone: 'UTC',
    });
    const loading = await screen.findByRole('status', {
      name: m.builder_board_loading(),
    });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
    expect(screen.queryByTestId('event-builder-route')).toBeNull();
  });

  it('renders the board as its own page, without the Prepare workspace', async () => {
    renderRoute({
      initialPath: '/app/schedules/ministry-1/cycle-1/assign',
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
      initialPath: '/app/schedules/ministry-1/cycle-1/assign',
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
      initialPath:
        '/app/schedules/ministry-1/cycle-1/assign?swapRequest=request-1',
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
      initialPath: '/app/schedules/ministry-1/cycle-1/assign?swapRequest=gone',
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
      initialPath:
        '/app/schedules/ministry-1/cycle-1/assign?swapRequest=request-1',
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

    expect(
      await screen.findByRole('heading', { name: m.shell_not_found_title() }),
    ).toBeVisible();
    expect(screen.queryByTestId('event-builder-route')).not.toBeInTheDocument();
  });
});

describe('date strip selection in the URL', () => {
  const DAYS = ['2026-07-10', '2026-07-11', '2026-07-12'];
  const path = '/app/schedules/ministry-1/cycle-1/assign';

  beforeEach(() => {
    getCycleBuilderData.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-07-10',
        endDate: '2026-07-12',
      },
      roles: [],
      events: DAYS.map((day, index) => ({
        participation: {
          id: `participation-${index}`,
          churchId: 'church-1',
          eventId: `event-${index}`,
          ministryId: 'ministry-1',
          state: 'assigning',
        },
        event: {
          id: `event-${index}`,
          churchId: 'church-1',
          cycleId: 'cycle-1',
          title: `Service ${index}`,
          start: `${day}T09:00:00.000Z`,
          end: `${day}T11:00:00.000Z`,
          status: 'scheduled',
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z',
        },
        eventTimeBlocks: [],
      })),
    });
  });

  const pressed = () =>
    within(screen.getByRole('group', { name: m.builder_ui_cycle_dates() }))
      .getAllByTestId('cycle-date-chip')
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.date);

  it('shows every date on a fresh visit', async () => {
    renderRoute({ initialPath: path, churchTimezone: 'UTC' });
    await screen.findByRole('group', { name: m.builder_ui_cycle_dates() });
    expect(pressed()).toEqual([]);
  });

  it('restores the selection from ?days= and writes each change back', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute({
      initialPath: `${path}?days=2026-07-11`,
      churchTimezone: 'UTC',
    });
    await screen.findByRole('group', { name: m.builder_ui_cycle_dates() });
    expect(pressed()).toEqual(['2026-07-11']);

    const [first] = screen.getAllByTestId('cycle-date-chip');
    await user.click(first);
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        days: '2026-07-10,2026-07-11',
      }),
    );
    expect(pressed()).toEqual(['2026-07-10', '2026-07-11']);

    await user.click(screen.getByTestId('cycle-date-strip-clear'));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(pressed()).toEqual([]);
  });

  it('ignores a malformed ?days= and shows every date', async () => {
    renderRoute({
      initialPath: `${path}?days=not-a-date`,
      churchTimezone: 'UTC',
    });
    await screen.findByRole('group', { name: m.builder_ui_cycle_dates() });
    expect(pressed()).toEqual([]);
  });

  it('drops a well-formed day outside the cycle and keeps the board full', async () => {
    renderRoute({
      initialPath: `${path}?days=2099-01-01`,
      churchTimezone: 'UTC',
    });
    await screen.findByRole('group', { name: m.builder_ui_cycle_dates() });
    expect(pressed()).toEqual([]);
    expect(screen.queryByText(m.builder_ui_no_dates())).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.builder_ui_no_dates_match()),
    ).not.toBeInTheDocument();
  });

  it('dedupes, sorts and drops unknown days from ?days=', async () => {
    renderRoute({
      initialPath: `${path}?days=2026-07-11,2099-01-01,2026-07-10,2026-07-11`,
      churchTimezone: 'UTC',
    });
    await screen.findByRole('group', { name: m.builder_ui_cycle_dates() });
    expect(pressed()).toEqual(['2026-07-10', '2026-07-11']);
  });

  it('keeps ?days= when it consumes a swap request link', async () => {
    const { router } = renderRoute({
      initialPath: `${path}?swapRequest=gone&days=2026-07-12`,
      churchTimezone: 'UTC',
    });
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(m.swap_board_unavailable()),
    );
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ days: '2026-07-12' }),
    );
    expect(pressed()).toEqual(['2026-07-12']);
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
    initialPath: '/app/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  expect(await screen.findByText(m.no_access_title())).toBeVisible();
  expect(router.state.location.pathname).toBe('/app/no-access');
});

it('shows indistinguishable not found for a foreign Ministry leader receiving 404', async () => {
  getCycleBuilderData.mockRejectedValue(
    new AxiosError('Secret ministry name', undefined, undefined, undefined, {
      status: 404,
    } as AxiosResponse),
  );
  const { router } = renderRoute({
    initialPath: '/app/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  expect(
    await screen.findByRole('heading', { name: m.shell_not_found_title() }),
  ).toBeVisible();
  expect(screen.queryByText('Secret ministry name')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe(
    '/app/schedules/ministry-1/cycle-1/assign',
  );
});

it('preserves the assign destination when signed out', async () => {
  getSession.mockResolvedValue({ data: null });
  const path = '/app/schedules/ministry-1/cycle-1/assign';
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
  const path = '/app/schedules/ministry-1/cycle-1/assign';
  const { router } = renderRoute({ initialPath: path, churchTimezone: 'UTC' });
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toEqual({ redirect: path });
});

it('preserves the current board destination when the session expires after switching boards', async () => {
  const { router } = renderRoute({
    initialPath: '/app/schedules/ministry-1/cycle-1/assign',
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
  const path = '/app/schedules/ministry-2/cycle-2/assign';
  await act(async () => {
    await router.navigate({
      to: '/app/schedules/$ministryId/$cycleId/assign',
      params: { ministryId: 'ministry-2', cycleId: 'cycle-2' },
    });
  });
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toEqual({ redirect: path });
});

interface PublishableBoardInput {
  assignedVolunteerIds: string[];
}

/** One assigning Event with one future Shift asking for a single person. */
function publishableBoard({ assignedVolunteerIds }: PublishableBoardInput) {
  const start = '2030-08-02T09:00:00.000Z';
  const end = '2030-08-02T11:00:00.000Z';
  const assignments = assignedVolunteerIds.map((volunteerId) => ({
    id: `assignment-${volunteerId}`,
    churchId: 'church-1',
    eventTimeBlockId: 'block-1',
    participationId: 'participation-1',
    shiftId: 'shift-1',
    volunteerId,
    roleId: 'role-1',
    shiftRequirementId: 'requirement-1',
    status: 'pending',
    assignedAt: '2030-08-01T09:00:00.000Z',
    lateMark: false,
  }));
  return {
    affectedVolunteerCount: 0,
    cycle: {
      id: 'cycle-1',
      name: 'August 2030',
      startDate: '2030-08-01',
      endDate: '2030-08-31',
    },
    roles: [{ id: 'role-1', name: 'Greeter' }],
    events: [
      {
        participation: { id: 'participation-1', state: 'assigning' },
        event: {
          id: 'event-1',
          title: 'Sunday Gathering',
          start,
          end,
          status: 'scheduled',
        },
        eventTimeBlocks: [
          {
            eventTimeBlock: { id: 'block-1', startTime: start, endTime: end },
            included: true,
            cancelled: false,
            shifts: [
              {
                shift: { id: 'shift-1', startTime: start, endTime: end },
                requirements: [
                  {
                    id: 'requirement-1',
                    roleId: 'role-1',
                    sectorName: 'Main',
                    peopleNeeded: 1,
                  },
                ],
                assignments,
                eligibleVolunteers: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Opens the board, then Publish and the dialog's own Publish. */
async function publishFromBoard() {
  const user = userEvent.setup();
  renderRoute({
    initialPath: '/app/schedules/ministry-1/cycle-1/assign',
    churchTimezone: 'UTC',
  });
  await user.click(
    await screen.findByRole('button', { name: m.builder_ui_publish() }),
  );
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: m.builder_ui_publish() }),
  );
  return user;
}

describe('Assign board route: publish', () => {
  it('publishes a fully staffed board without confirming below the target', async () => {
    getCycleBuilderData.mockResolvedValue(
      publishableBoard({ assignedVolunteerIds: ['ana'] }),
    );
    publishCycle.mockResolvedValue({ published: true });

    await publishFromBoard();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledExactlyOnceWith(
        m.builder_logic_cycle_published(),
      ),
    );
    expect(publishCycle).toHaveBeenCalledExactlyOnceWith(
      'cycle-1',
      { confirmBelowFull: false },
      { ministryId: 'ministry-1' },
    );
    expect(toastWarning).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms below the target when the board has an empty place', async () => {
    getCycleBuilderData.mockResolvedValue(
      publishableBoard({ assignedVolunteerIds: [] }),
    );
    publishCycle.mockResolvedValue({ published: true });

    await publishFromBoard();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(publishCycle).toHaveBeenCalledExactlyOnceWith(
      'cycle-1',
      { confirmBelowFull: true },
      { ministryId: 'ministry-1' },
    );
  });

  it('says publishing failed when the request is refused with an error', async () => {
    getCycleBuilderData.mockResolvedValue(
      publishableBoard({ assignedVolunteerIds: ['ana'] }),
    );
    publishCycle.mockRejectedValue(new Error('offline'));

    await publishFromBoard();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledExactlyOnceWith(
        m.common_publish_failed(),
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('asks to confirm with the server gap count when publish is refused', async () => {
    getCycleBuilderData.mockResolvedValue(
      publishableBoard({ assignedVolunteerIds: ['ana'] }),
    );
    publishCycle
      .mockResolvedValueOnce({ published: false, gapCount: 2 })
      .mockResolvedValueOnce({ published: true });

    const user = await publishFromBoard();

    const confirmation = await screen.findByRole('dialog');
    expect(
      within(confirmation).getByText(
        m.prepare_publish_gaps_other({ count: 2 }),
      ),
    ).toBeVisible();
    expect(getCycleBuilderData).toHaveBeenCalledTimes(2);
    expect(toastWarning).not.toHaveBeenCalled();
    await user.click(
      within(confirmation).getByRole('button', {
        name: m.builder_ui_publish(),
      }),
    );

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(publishCycle).toHaveBeenCalledTimes(2);
    expect(publishCycle).toHaveBeenLastCalledWith(
      'cycle-1',
      { confirmBelowFull: true },
      { ministryId: 'ministry-1' },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('forgets the refusal when the leader cancels the confirmation', async () => {
    getCycleBuilderData.mockResolvedValue(
      publishableBoard({ assignedVolunteerIds: ['ana'] }),
    );
    publishCycle.mockResolvedValue({ published: false, gapCount: 2 });

    const user = await publishFromBoard();
    const refusal = await screen.findByRole('dialog');
    await within(refusal).findByText(
      m.prepare_publish_gaps_other({ count: 2 }),
    );
    await user.click(
      within(refusal).getByRole('button', { name: m.builder_ui_cancel() }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole('button', { name: m.builder_ui_publish() }),
    );

    expect(
      within(await screen.findByRole('dialog')).getByText(
        m.builder_ui_publish_full(),
      ),
    ).toBeVisible();
    expect(publishCycle).toHaveBeenCalledOnce();
  });
});
