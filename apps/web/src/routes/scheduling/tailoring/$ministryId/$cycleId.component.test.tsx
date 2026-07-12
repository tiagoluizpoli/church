import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

beforeEach(() => {
  vi.clearAllMocks();
});

const getPlanningCycle = vi.fn();
const listMinistries = vi.fn();
const getCycleParticipation = vi.fn();
const getScheduleBuilderData = vi.fn();
const setParticipationInclusions = vi.fn();
const fireAvailability = vi.fn();
const resendAvailabilityReminder = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    getCycleParticipation: (...args: unknown[]) =>
      getCycleParticipation(...args),
    getScheduleBuilderData: (...args: unknown[]) =>
      getScheduleBuilderData(...args),
    setParticipationInclusions: (...args: unknown[]) =>
      setParticipationInclusions(...args),
    fireAvailability: (...args: unknown[]) => fireAvailability(...args),
    resendAvailabilityReminder: (...args: unknown[]) =>
      resendAvailabilityReminder(...args),
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

function renderWorkspace() {
  return renderRoute({
    initialPath: '/scheduling/tailoring/ministry-1/cycle-1',
  });
}

const CYCLE_RESPONSE = {
  cycle: {
    id: 'cycle-1',
    churchId: 'church-1',
    name: 'August 2026',
    startDate: '2026-07-10T00:00:00',
    endDate: '2026-07-12T00:00:00',
    state: 'locked',
    createdAt: '2026-07-01T00:00:00',
    updatedAt: '2026-07-01T00:00:00',
  },
  events: [],
};

const MINISTRIES_RESPONSE = {
  ministries: [
    {
      id: 'ministry-1',
      churchId: 'church-1',
      name: 'Greeters',
      enforcementType: 'strict',
      defaultDirection: 'all_out',
      createdAt: '2026-07-01T00:00:00',
      updatedAt: '2026-07-01T00:00:00',
    },
  ],
};

const PARTICIPATION_RESPONSE = {
  events: [
    {
      participation: {
        id: 'participation-1',
        churchId: 'church-1',
        ministryId: 'ministry-1',
        eventId: 'event-1',
        state: 'tailoring',
      },
      event: {
        id: 'event-1',
        churchId: 'church-1',
        planningCycleId: 'cycle-1',
        title: 'Sunday Service',
        startDate: '2026-07-11T09:00:00',
        endDate: '2026-07-11T11:00:00',
        status: 'scheduled',
        eventType: 'hourly',
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      },
      slots: [
        {
          slot: {
            id: 'slot-1',
            churchId: 'church-1',
            eventId: 'event-1',
            startTime: '2026-07-11T09:00:00',
            endTime: '2026-07-11T11:00:00',
            label: 'Greeter',
            status: 'active',
            requirements: [],
          },
          included: false,
          shifts: [],
          requirements: [],
        },
      ],
    },
    {
      participation: {
        id: 'participation-2',
        churchId: 'church-1',
        ministryId: 'ministry-1',
        eventId: 'event-2',
        state: 'tailoring',
      },
      event: {
        id: 'event-2',
        churchId: 'church-1',
        planningCycleId: 'cycle-1',
        title: 'Saturday Setup',
        startDate: '2026-07-10T09:00:00',
        endDate: '2026-07-10T11:00:00',
        status: 'scheduled',
        eventType: 'hourly',
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      },
      slots: [
        {
          slot: {
            id: 'slot-2',
            churchId: 'church-1',
            eventId: 'event-2',
            startTime: '2026-07-10T09:00:00',
            endTime: '2026-07-10T11:00:00',
            label: 'Setup crew',
            status: 'active',
            requirements: [],
          },
          included: false,
          shifts: [],
          requirements: [],
        },
      ],
    },
  ],
};

describe('Tailoring workspace route composition (US3/T028)', () => {
  it('renders the ministry+cycle header, calendar, filters, and slot list together', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });

    renderWorkspace();

    expect(
      await screen.findByText('Greeters · August 2026'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-name-filter')).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-slot-row-slot-1')).toBeInTheDocument();
  });

  it('operates fully at a mobile viewport width — calendar, filters, and slot list all reachable (T023a)', async () => {
    window.innerWidth = 375;
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    expect(screen.getByTestId('tailoring-calendar')).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-name-filter')).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-time-mode-filter'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-time-start-filter'),
    ).toBeInTheDocument();

    setParticipationInclusions.mockResolvedValue(undefined);
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    expect(setParticipationInclusions).toHaveBeenCalledWith('participation-1', {
      timeSlotIds: ['slot-1'],
    });
  });

  it('filters the slot list to a clicked calendar day with no network request', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    expect(screen.getByTestId('tailoring-slot-row-slot-2')).toBeInTheDocument();
    const callCountBeforeFilter = getCycleParticipation.mock.calls.length;

    await user.click(screen.getByTestId('tailoring-calendar-day-2026-07-10'));

    expect(
      screen.queryByTestId('tailoring-slot-row-slot-1'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('tailoring-slot-row-slot-2')).toBeInTheDocument();
    expect(getCycleParticipation.mock.calls.length).toBe(callCountBeforeFilter);
  });
});

describe('Tailoring workspace route — permission failure (US3/T023c)', () => {
  it('renders a permission-denied state on a 403, not a crash', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });

    renderWorkspace();

    expect(
      await screen.findByTestId('tailoring-forbidden-state'),
    ).toBeInTheDocument();
  });
});

describe('Tailoring workspace route — network failure (US3/T023d)', () => {
  it('renders a retryable error state, not a crash or infinite spinner', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });

    renderWorkspace();

    expect(
      await screen.findByTestId('tailoring-retryable-error-state'),
    ).toBeInTheDocument();
  });
});

describe('Tailoring workspace batched save (US4/T029)', () => {
  it('fires exactly one fireAvailability call per touched participation, not per slot/shift', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    fireAvailability.mockResolvedValue({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-2'));

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    await user.click(saveButton);

    expect(fireAvailability).toHaveBeenCalledTimes(2);
    expect(fireAvailability).toHaveBeenCalledWith('participation-1');
    expect(fireAvailability).toHaveBeenCalledWith('participation-2');
    expect(resendAvailabilityReminder).not.toHaveBeenCalled();
  });
});

describe('Tailoring workspace remains editable post-release (US4/T030/FR-017)', () => {
  it('uses resendAvailabilityReminder (not fireAvailability) for a participation already past tailoring', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          participation: {
            ...PARTICIPATION_RESPONSE.events[0]?.participation,
            state: 'rostering',
          },
        },
      ],
    });
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    resendAvailabilityReminder.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    await screen.findByTestId('tailoring-touched-count');

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(resendAvailabilityReminder).toHaveBeenCalledWith('participation-1');
    expect(fireAvailability).not.toHaveBeenCalled();
  });
});

describe('Tailoring workspace unsaved-changes guard (US4/T030a)', () => {
  it('blocks navigation away when there are touched, unsaved edits', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    const user = userEvent.setup();

    const { router } = renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    await screen.findByTestId('tailoring-touched-count');

    router.navigate({ to: '/scheduling/tailoring' });

    expect(
      await screen.findByTestId('tailoring-leave-confirm'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('tailoring-leave-cancel'));
    expect(
      screen.queryByTestId('tailoring-leave-confirm'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('tailoring-workspace-page')).toBeInTheDocument();
  });

  it('does not block navigation when there are no unsaved edits', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });

    const { router } = renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    router.navigate({ to: '/scheduling/tailoring' });

    expect(
      screen.queryByTestId('tailoring-leave-confirm'),
    ).not.toBeInTheDocument();
  });
});

describe('Tailoring workspace double-submit guard (US4/T030b)', () => {
  it('disables the save action after the first click, sending exactly one batch', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    let resolveFire: (() => void) | undefined;
    fireAvailability.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFire = () =>
            resolve({ createdCheckCount: 1, notifiedVolunteerCount: 1 });
        }),
    );
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    await screen.findByTestId('tailoring-touched-count');

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    await user.click(saveButton);
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);

    resolveFire?.();
    await screen.findByTestId('tailoring-slot-row-slot-1');

    expect(fireAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('Tailoring workspace mid-flight save unmount (US4/T030c)', () => {
  it('does not throw when navigating away while the batch is still in flight', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamId: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    fireAvailability.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ createdCheckCount: 1, notifiedVolunteerCount: 1 }),
            50,
          );
        }),
    );
    const user = userEvent.setup();

    const { router, unmount } = renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('participation-slot-checkbox-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('save-and-fire-availability-button'));

    expect(() => {
      router.navigate({ to: '/scheduling/tailoring' });
      unmount();
    }).not.toThrow();
  });
});
