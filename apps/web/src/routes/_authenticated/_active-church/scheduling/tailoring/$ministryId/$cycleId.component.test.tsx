import { screen, waitFor } from '@testing-library/react';
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
const splitParticipationShifts = vi.fn();
const upsertShiftRequirement = vi.fn();
const fireAvailability = vi.fn();
const resendAvailabilityReminder = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
const getActiveChurchStatus = vi
  .fn()
  .mockResolvedValue({ status: 'resolved', churchId: 'church-1' });

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
    splitParticipationShifts: (...args: unknown[]) =>
      splitParticipationShifts(...args),
    upsertShiftRequirement: (...args: unknown[]) =>
      upsertShiftRequirement(...args),
    fireAvailability: (...args: unknown[]) => fireAvailability(...args),
    resendAvailabilityReminder: (...args: unknown[]) =>
      resendAvailabilityReminder(...args),
  },
  activeChurchApi: {
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
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
  it('enables Save split only after split configuration changes, independent of headcounts (T044)', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          slots: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.slots[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-11T09:00:00',
                  endTime: '2026-07-11T11:00:00',
                },
              ],
            },
          ],
        },
      ],
    });
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    splitParticipationShifts.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(await screen.findByTestId('toggle-slot-expand-slot-1'));
    const saveSplitButton = screen.getByTestId('save-split-button-slot-1');
    expect(saveSplitButton).toBeDisabled();

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));

    expect(saveSplitButton).toBeEnabled();
    await user.click(saveSplitButton);

    expect(splitParticipationShifts).toHaveBeenCalledWith(
      'participation-1',
      'slot-1',
      { strategy: { kind: 'equal-n', n: 2 } },
    );
  });

  it('stacks day strip, horizontal filters, then slot list in workspace order (T042)', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });

    renderWorkspace();

    const workspaceStack = await screen.findByTestId(
      'tailoring-workspace-stack',
    );
    const dayStrip = screen.getByTestId('tailoring-calendar-strip');
    const nameFilter = screen.getByTestId('tailoring-name-filter');
    const slotList = screen.getByTestId('tailoring-slot-list');

    expect(workspaceStack).toContainElement(dayStrip);
    expect(workspaceStack).toContainElement(nameFilter);
    expect(workspaceStack).toContainElement(slotList);
    expect(
      dayStrip.compareDocumentPosition(nameFilter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      nameFilter.compareDocumentPosition(slotList) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the ministry+cycle header, calendar, filters, and slot list together', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });

    renderWorkspace();

    expect(
      await screen.findByText('Greeters · August 2026'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-name-filter')).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-slot-row-slot-1')).toBeInTheDocument();

    const browseLink = screen.getByTestId('browse-all-cycles-link');
    expect(browseLink).toHaveAttribute(
      'href',
      expect.stringContaining('/scheduling/tailoring/ministry-1'),
    );
    expect(browseLink).toHaveAttribute(
      'href',
      expect.stringContaining('browse=true'),
    );
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
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    expect(screen.getByTestId('tailoring-calendar')).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-10'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-12'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-name-filter')).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-time-mode-filter'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('tailoring-time-start-filter'),
    ).toBeInTheDocument();

    setParticipationInclusions.mockResolvedValue(undefined);
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
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
      callerTeamIds: null,
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

describe('Tailoring workspace headcount save partial-failure isolation (Iteration 2/T045b/FR-022b)', () => {
  it('lets a succeeded role headcount stay saved when a sibling role in the same batch fails, and only retries the failed one', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          slots: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.slots[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-11T09:00:00',
                  endTime: '2026-07-11T11:00:00',
                },
              ],
            },
          ],
        },
      ],
    });
    getScheduleBuilderData.mockResolvedValue({
      roles: [
        { id: 'role-1', name: 'Greeter' },
        { id: 'role-2', name: 'Usher' },
      ],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    upsertShiftRequirement.mockImplementation(
      (_shiftId: string, body: { roleId: string }) =>
        body.roleId === 'role-1'
          ? Promise.reject(new Error('network error'))
          : Promise.resolve({}),
    );
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(await screen.findByTestId('toggle-slot-expand-slot-1'));
    await user.type(screen.getByTestId('headcount-input-shift-1-role-1'), '3');
    await user.type(screen.getByTestId('headcount-input-shift-1-role-2'), '4');

    const saveButton = screen.getByTestId('save-headcounts-button-slot-1');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(upsertShiftRequirement).toHaveBeenCalledTimes(2);
    });
    expect(upsertShiftRequirement).toHaveBeenCalledWith(
      'shift-1',
      expect.objectContaining({ roleId: 'role-1', requiredCount: 3 }),
    );
    expect(upsertShiftRequirement).toHaveBeenCalledWith(
      'shift-1',
      expect.objectContaining({ roleId: 'role-2', requiredCount: 4 }),
    );

    // The succeeded role-2 value must not remain flagged unsaved; the failed
    // role-1 value must — so the slot's single per-slot indicator stays on.
    await waitFor(() => {
      expect(
        screen.getByTestId('headcount-unsaved-indicator-slot-1'),
      ).toBeInTheDocument();
    });

    // Retry: only the still-failed role-1 value should be resent — the
    // already-succeeded role-2 value must not be re-sent or re-flagged.
    await user.click(screen.getByTestId('save-headcounts-button-slot-1'));

    await waitFor(() => {
      expect(upsertShiftRequirement).toHaveBeenCalledTimes(3);
    });
    expect(upsertShiftRequirement).toHaveBeenNthCalledWith(
      3,
      'shift-1',
      expect.objectContaining({ roleId: 'role-1' }),
    );
  });
});

describe('Tailoring workspace re-serving retains prior edits (Iteration 2/T046/FR-025)', () => {
  it('keeps a pending headcount draft in memory across a Serving -> Not serving -> Serving round trip within the same visit', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);

    let includedSlotIds = ['slot-1'];
    getCycleParticipation.mockImplementation(() =>
      Promise.resolve({
        events: [
          {
            ...PARTICIPATION_RESPONSE.events[0],
            slots: [
              {
                ...PARTICIPATION_RESPONSE.events[0]?.slots[0],
                included: includedSlotIds.includes('slot-1'),
                shifts: includedSlotIds.includes('slot-1')
                  ? [
                      {
                        id: 'shift-1',
                        participationId: 'participation-1',
                        timeSlotId: 'slot-1',
                        startTime: '2026-07-11T09:00:00',
                        endTime: '2026-07-11T11:00:00',
                      },
                    ]
                  : [],
              },
            ],
          },
        ],
      }),
    );
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(await screen.findByTestId('toggle-slot-expand-slot-1'));
    await user.type(
      await screen.findByTestId('headcount-input-shift-1-role-1'),
      '5',
    );
    expect(screen.getByTestId('headcount-input-shift-1-role-1')).toHaveValue(5);

    // Flip Serving off — server round-trips to included:false, shifts drop.
    includedSlotIds = [];
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await waitFor(() => {
      expect(
        screen.queryByTestId('headcount-input-shift-1-role-1'),
      ).not.toBeInTheDocument();
    });

    // Flip Serving back on within the same visit — the prior draft must
    // still be there, not reset to blank/default (FR-025).
    includedSlotIds = ['slot-1'];
    await user.click(screen.getByTestId('serving-toggle-slot-1'));

    await waitFor(() => {
      expect(screen.getByTestId('headcount-input-shift-1-role-1')).toHaveValue(
        5,
      );
    });
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
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    fireAvailability.mockResolvedValue({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('serving-toggle-slot-2'));

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    await user.click(saveButton);
    await user.click(await screen.findByTestId('tailoring-send-confirm'));

    expect(fireAvailability).toHaveBeenCalledTimes(2);
    expect(fireAvailability).toHaveBeenCalledWith('participation-1');
    expect(fireAvailability).toHaveBeenCalledWith('participation-2');
    expect(resendAvailabilityReminder).not.toHaveBeenCalled();
  });
});

describe('Tailoring workspace send-availability confirmation (P0 hardening)', () => {
  it('does not send anything until the confirmation dialog is accepted', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('save-and-fire-availability-button'));

    const dialog = await screen.findByTestId('tailoring-send-confirm-dialog');
    expect(dialog).toHaveTextContent('Sunday Service');
    expect(fireAvailability).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('tailoring-send-cancel'));

    expect(
      screen.queryByTestId('tailoring-send-confirm-dialog'),
    ).not.toBeInTheDocument();
    expect(fireAvailability).not.toHaveBeenCalled();
  });

  it('sends only the touched events named in the confirmation dialog', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    fireAvailability.mockResolvedValue({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('save-and-fire-availability-button'));

    const dialog = await screen.findByTestId('tailoring-send-confirm-dialog');
    expect(dialog).toHaveTextContent('Sunday Service');
    expect(dialog).not.toHaveTextContent('Saturday Setup');

    await user.click(screen.getByTestId('tailoring-send-confirm'));

    expect(fireAvailability).toHaveBeenCalledTimes(1);
    expect(fireAvailability).toHaveBeenCalledWith('participation-1');
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
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    resendAvailabilityReminder.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    await user.click(await screen.findByTestId('tailoring-send-confirm'));

    expect(resendAvailabilityReminder).toHaveBeenCalledWith('participation-1');
    expect(fireAvailability).not.toHaveBeenCalled();
  });
});

describe('Tailoring workspace unsaved-changes guard (US4/T030a)', () => {
  it('blocks navigation for a never-saved split change even with no touched participation (T048)', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          slots: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.slots[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-11T09:00:00',
                  endTime: '2026-07-11T11:00:00',
                },
              ],
            },
          ],
        },
      ],
    });
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    const { router } = renderWorkspace();

    await user.click(await screen.findByTestId('toggle-slot-expand-slot-1'));
    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));

    router.navigate({ to: '/scheduling/tailoring' });

    expect(
      await screen.findByTestId('tailoring-leave-confirm'),
    ).toBeInTheDocument();
  });

  it('blocks navigation away when there are touched, unsaved edits', async () => {
    getPlanningCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    const user = userEvent.setup();

    const { router } = renderWorkspace();

    await screen.findByTestId('tailoring-slot-row-slot-1');
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
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
      callerTeamIds: null,
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
      callerTeamIds: null,
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
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');

    const saveButton = screen.getByTestId('save-and-fire-availability-button');
    await user.click(saveButton);
    await user.click(await screen.findByTestId('tailoring-send-confirm'));
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
      callerTeamIds: null,
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
    await user.click(screen.getByTestId('serving-toggle-slot-1'));
    await screen.findByTestId('tailoring-touched-count');
    await user.click(screen.getByTestId('save-and-fire-availability-button'));
    await user.click(await screen.findByTestId('tailoring-send-confirm'));

    expect(() => {
      router.navigate({ to: '/scheduling/tailoring' });
      unmount();
    }).not.toThrow();
  });
});
