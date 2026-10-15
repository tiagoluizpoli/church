import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

beforeEach(() => {
  vi.clearAllMocks();
});

const getCycle = vi.fn();
const listMinistries = vi.fn();
const getCycleParticipation = vi.fn();
const getScheduleBuilderData = vi.fn();
const setParticipationInclusions = vi.fn();
const splitParticipationShifts = vi.fn();
const upsertShiftRequirement = vi.fn();
const askAvailability = vi.fn();
const resendAvailabilityReminder = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    getCycle: (...args: unknown[]) => getCycle(...args),
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
    askAvailability: (...args: unknown[]) => askAvailability(...args),
    resendAvailabilityReminder: (...args: unknown[]) =>
      resendAvailabilityReminder(...args),
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

interface ShiftRequirementBody {
  roleId: string;
}

function renderWorkspace() {
  return renderRoute({
    initialPath: '/schedules/ministry-1/cycle-1',
    churchTimezone: 'UTC',
  });
}

const CYCLE_RESPONSE = {
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
};

const MINISTRIES_RESPONSE = {
  ministries: [
    {
      id: 'ministry-1',
      churchId: 'church-1',
      name: 'Greeters',
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
        state: 'preparing',
      },
      event: {
        id: 'event-1',
        churchId: 'church-1',
        cycleId: 'cycle-1',
        title: 'Sunday Service',
        start: '2026-07-11T09:00:00',
        end: '2026-07-11T11:00:00',
        status: 'scheduled',
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      },
      eventTimeBlocks: [
        {
          eventTimeBlock: {
            id: 'event-time-block-1',
            churchId: 'church-1',
            eventId: 'event-1',
            startTime: '2026-07-11T09:00:00.000Z',
            endTime: '2026-07-11T11:00:00.000Z',
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
        state: 'preparing',
      },
      event: {
        id: 'event-2',
        churchId: 'church-1',
        cycleId: 'cycle-1',
        title: 'Saturday Setup',
        start: '2026-07-10T09:00:00',
        end: '2026-07-10T11:00:00',
        status: 'scheduled',
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      },
      eventTimeBlocks: [
        {
          eventTimeBlock: {
            id: 'event-time-block-2',
            churchId: 'church-1',
            eventId: 'event-2',
            startTime: '2026-07-10T09:00:00.000Z',
            endTime: '2026-07-10T11:00:00.000Z',
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

describe('Prepare workspace route composition (US3/T028)', () => {
  it('enables Save split only after split configuration changes, independent of headcounts (T044)', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          eventTimeBlocks: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.eventTimeBlocks[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-11T09:00:00.000Z',
                  endTime: '2026-07-11T11:00:00.000Z',
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
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    splitParticipationShifts.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(
      await screen.findByTestId(
        'toggle-event-time-block-expand-event-time-block-1',
      ),
    );
    const saveSplitButton = screen.getByTestId(
      'save-split-button-event-time-block-1',
    );
    expect(saveSplitButton).toBeDisabled();

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));

    expect(saveSplitButton).toBeEnabled();
    await user.click(saveSplitButton);

    expect(splitParticipationShifts).toHaveBeenCalledWith(
      'participation-1',
      'event-time-block-1',
      { strategy: { kind: 'equal-n', n: 2 } },
    );
  });

  it('stacks day strip, horizontal filters, then time block list in workspace order (T042)', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });

    renderWorkspace();

    const workspaceStack = await screen.findByTestId('prepare-workspace-stack');
    const dayStrip = screen.getByTestId('prepare-calendar-strip');
    const nameFilter = screen.getByTestId('prepare-name-filter');
    const eventTimeBlockList = screen.getByTestId(
      'prepare-event-time-block-list',
    );

    expect(workspaceStack).toContainElement(dayStrip);
    expect(workspaceStack).toContainElement(nameFilter);
    expect(workspaceStack).toContainElement(eventTimeBlockList);
    expect(
      dayStrip.compareDocumentPosition(nameFilter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      nameFilter.compareDocumentPosition(eventTimeBlockList) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the ministry+cycle header, calendar, filters, and time block list together', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });

    renderWorkspace();

    expect(
      await screen.findByText('Greeters · August 2026'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('prepare-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('prepare-name-filter')).toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-event-time-block-row-event-time-block-1'),
    ).toBeInTheDocument();

    const browseLink = screen.getByTestId('browse-all-cycles-link');
    expect(browseLink).toHaveAttribute(
      'href',
      expect.stringContaining('/schedules/ministry-1'),
    );
    expect(browseLink).toHaveAttribute(
      'href',
      expect.stringContaining('browse=true'),
    );
  });

  it('operates fully at a mobile viewport width — calendar, filters, and time block list all reachable (T023a)', async () => {
    window.innerWidth = 375;
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    expect(screen.getByTestId('prepare-calendar')).toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-calendar-day-2026-07-10'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-calendar-day-2026-07-11'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-calendar-day-2026-07-12'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('prepare-name-filter')).toBeInTheDocument();
    expect(screen.getByTestId('prepare-time-mode-filter')).toBeInTheDocument();
    expect(screen.getByTestId('prepare-time-start-filter')).toBeInTheDocument();

    setParticipationInclusions.mockResolvedValue(undefined);
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    expect(setParticipationInclusions).toHaveBeenCalledWith('participation-1', {
      eventTimeBlockIds: ['event-time-block-1'],
    });
  });

  it('filters the time block list to a clicked calendar day with no network request', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    expect(
      screen.getByTestId('prepare-event-time-block-row-event-time-block-2'),
    ).toBeInTheDocument();
    const callCountBeforeFilter = getCycleParticipation.mock.calls.length;

    await user.click(screen.getByTestId('prepare-calendar-day-2026-07-10'));

    expect(
      screen.queryByTestId('prepare-event-time-block-row-event-time-block-1'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-event-time-block-row-event-time-block-2'),
    ).toBeInTheDocument();
    expect(getCycleParticipation.mock.calls.length).toBe(callCountBeforeFilter);
  });
});

describe('Prepare workspace headcount save partial-failure isolation (Iteration 2/T045b/FR-022b)', () => {
  it('lets a succeeded role headcount stay saved when a sibling role in the same batch fails, and only retries the failed one', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          eventTimeBlocks: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.eventTimeBlocks[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-11T09:00:00.000Z',
                  endTime: '2026-07-11T11:00:00.000Z',
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
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    upsertShiftRequirement.mockImplementation(
      (_shiftId: string, body: ShiftRequirementBody) =>
        body.roleId === 'role-1'
          ? Promise.reject(new Error('network error'))
          : Promise.resolve({}),
    );
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(
      await screen.findByTestId(
        'toggle-event-time-block-expand-event-time-block-1',
      ),
    );
    await user.type(
      screen.getByTestId('headcount-input-shift-1-sector-1-role-1'),
      '3',
    );
    await user.type(
      screen.getByTestId('headcount-input-shift-1-sector-1-role-2'),
      '4',
    );

    const saveButton = screen.getByTestId(
      'save-headcounts-button-event-time-block-1',
    );
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(upsertShiftRequirement).toHaveBeenCalledTimes(2);
    });
    expect(upsertShiftRequirement).toHaveBeenCalledWith(
      'shift-1',
      expect.objectContaining({
        sectorId: 'sector-1',
        roleId: 'role-1',
        peopleNeeded: 3,
      }),
    );
    expect(upsertShiftRequirement).toHaveBeenCalledWith(
      'shift-1',
      expect.objectContaining({ roleId: 'role-2', peopleNeeded: 4 }),
    );

    // The succeeded role-2 value must not remain flagged unsaved; the failed
    // role-1 value must — so the time block's single per-time-block indicator stays on.
    await waitFor(() => {
      expect(
        screen.getByTestId('headcount-unsaved-indicator-event-time-block-1'),
      ).toBeInTheDocument();
    });

    // Retry: only the still-failed role-1 value should be resent — the
    // already-succeeded role-2 value must not be re-sent or re-flagged.
    await user.click(
      screen.getByTestId('save-headcounts-button-event-time-block-1'),
    );

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

describe('Prepare workspace re-serving retains prior edits (Iteration 2/T046/FR-025)', () => {
  it('keeps a pending headcount draft in memory across a Serving -> Not serving -> Serving round trip within the same visit', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);

    let includedEventTimeBlockIds = ['event-time-block-1'];
    getCycleParticipation.mockImplementation(() =>
      Promise.resolve({
        events: [
          {
            ...PARTICIPATION_RESPONSE.events[0],
            eventTimeBlocks: [
              {
                ...PARTICIPATION_RESPONSE.events[0]?.eventTimeBlocks[0],
                included:
                  includedEventTimeBlockIds.includes('event-time-block-1'),
                shifts: includedEventTimeBlockIds.includes('event-time-block-1')
                  ? [
                      {
                        id: 'shift-1',
                        participationId: 'participation-1',
                        eventTimeBlockId: 'event-time-block-1',
                        startTime: '2026-07-11T09:00:00.000Z',
                        endTime: '2026-07-11T11:00:00.000Z',
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

    await user.click(
      await screen.findByTestId(
        'toggle-event-time-block-expand-event-time-block-1',
      ),
    );
    await user.type(
      await screen.findByTestId('headcount-input-shift-1-sector-1-role-1'),
      '5',
    );
    expect(
      screen.getByTestId('headcount-input-shift-1-sector-1-role-1'),
    ).toHaveValue(5);

    // Flip Serving off — server round-trips to included:false, shifts drop.
    includedEventTimeBlockIds = [];
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await waitFor(() => {
      expect(
        screen.queryByTestId('headcount-input-shift-1-sector-1-role-1'),
      ).not.toBeInTheDocument();
    });

    // Flip Serving back on within the same visit — the prior draft must
    // still be there, not reset to blank/default (FR-025).
    includedEventTimeBlockIds = ['event-time-block-1'];
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));

    await waitFor(() => {
      expect(
        screen.getByTestId('headcount-input-shift-1-sector-1-role-1'),
      ).toHaveValue(5);
    });
  });
});

describe('Prepare workspace route — permission failure (US3/T023c)', () => {
  it('renders a permission-denied state on a 403, not a crash', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });

    renderWorkspace();

    expect(
      await screen.findByTestId('prepare-forbidden-state'),
    ).toBeInTheDocument();
  });
});

describe('Prepare workspace route — network failure (US3/T023d)', () => {
  it('renders a retryable error state, not a crash or infinite spinner', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });

    renderWorkspace();

    expect(
      await screen.findByTestId('prepare-retryable-error-state'),
    ).toBeInTheDocument();
  });
});

describe('Prepare workspace batched save (US4/T029)', () => {
  it('calls askAvailability exactly once call per touched participation, not per time block/shift', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    askAvailability.mockResolvedValue({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');
    await user.click(screen.getByTestId('serving-toggle-event-time-block-2'));

    const saveButton = screen.getByTestId('save-and-ask-availability-button');
    await user.click(saveButton);
    await user.click(await screen.findByTestId('prepare-send-confirm'));

    expect(askAvailability).toHaveBeenCalledTimes(2);
    expect(askAvailability).toHaveBeenCalledWith('participation-1');
    expect(askAvailability).toHaveBeenCalledWith('participation-2');
    expect(resendAvailabilityReminder).not.toHaveBeenCalled();
  });
});

describe('Prepare workspace send-availability confirmation (P0 hardening)', () => {
  it('does not send anything until the confirmation dialog is accepted', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');
    await user.click(screen.getByTestId('save-and-ask-availability-button'));

    const dialog = await screen.findByTestId('prepare-send-confirm-dialog');
    expect(dialog).toHaveTextContent('Sunday Service');
    expect(askAvailability).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('prepare-send-cancel'));

    expect(
      screen.queryByTestId('prepare-send-confirm-dialog'),
    ).not.toBeInTheDocument();
    expect(askAvailability).not.toHaveBeenCalled();
  });

  it('sends only the touched events named in the confirmation dialog', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    askAvailability.mockResolvedValue({
      createdCheckCount: 1,
      notifiedVolunteerCount: 1,
    });
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');
    await user.click(screen.getByTestId('save-and-ask-availability-button'));

    const dialog = await screen.findByTestId('prepare-send-confirm-dialog');
    expect(dialog).toHaveTextContent('Sunday Service');
    expect(dialog).not.toHaveTextContent('Saturday Setup');

    await user.click(screen.getByTestId('prepare-send-confirm'));

    expect(askAvailability).toHaveBeenCalledTimes(1);
    expect(askAvailability).toHaveBeenCalledWith('participation-1');
  });
});

describe('Prepare workspace remains editable post-release (US4/T030/FR-017)', () => {
  it('uses resendAvailabilityReminder (not askAvailability) for a participation already past prepare', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          participation: {
            ...PARTICIPATION_RESPONSE.events[0]?.participation,
            state: 'assigning',
          },
        },
      ],
    });
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    resendAvailabilityReminder.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');

    const saveButton = screen.getByTestId('save-and-ask-availability-button');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    await user.click(await screen.findByTestId('prepare-send-confirm'));

    expect(resendAvailabilityReminder).toHaveBeenCalledWith('participation-1');
    expect(askAvailability).not.toHaveBeenCalled();
  });
});

describe('Prepare workspace unsaved-changes guard (US4/T030a)', () => {
  it('blocks navigation for a never-saved split change even with no touched participation (T048)', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue({
      events: [
        {
          ...PARTICIPATION_RESPONSE.events[0],
          eventTimeBlocks: [
            {
              ...PARTICIPATION_RESPONSE.events[0]?.eventTimeBlocks[0],
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-11T09:00:00.000Z',
                  endTime: '2026-07-11T11:00:00.000Z',
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
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    const { router } = renderWorkspace();

    await user.click(
      await screen.findByTestId(
        'toggle-event-time-block-expand-event-time-block-1',
      ),
    );
    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));

    router.navigate({ to: '/schedules' });

    expect(
      await screen.findByTestId('prepare-leave-confirm'),
    ).toBeInTheDocument();
  });

  it('blocks navigation away when there are touched, unsaved edits', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    const user = userEvent.setup();

    const { router } = renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');

    router.navigate({ to: '/schedules' });

    expect(
      await screen.findByTestId('prepare-leave-confirm'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('prepare-leave-cancel'));
    expect(
      screen.queryByTestId('prepare-leave-confirm'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('prepare-workspace-page')).toBeInTheDocument();
  });

  it('does not block navigation when there are no unsaved edits', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });

    const { router } = renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    router.navigate({ to: '/schedules' });

    expect(
      screen.queryByTestId('prepare-leave-confirm'),
    ).not.toBeInTheDocument();
  });
});

describe('Prepare workspace double-submit guard (US4/T030b)', () => {
  it('disables the save action after the first click, sending exactly one batch', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    let resolveFire: (() => void) | undefined;
    askAvailability.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFire = () =>
            resolve({ createdCheckCount: 1, notifiedVolunteerCount: 1 });
        }),
    );
    const user = userEvent.setup();

    renderWorkspace();

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');

    const saveButton = screen.getByTestId('save-and-ask-availability-button');
    await user.click(saveButton);
    await user.click(await screen.findByTestId('prepare-send-confirm'));
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);

    resolveFire?.();
    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );

    expect(askAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('Prepare workspace mid-flight save unmount (US4/T030c)', () => {
  it('does not throw when navigating away while the batch is still in flight', async () => {
    getCycle.mockResolvedValue(CYCLE_RESPONSE);
    listMinistries.mockResolvedValue(MINISTRIES_RESPONSE);
    getCycleParticipation.mockResolvedValue(PARTICIPATION_RESPONSE);
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      sectors: [{ id: 'sector-1', name: 'Stage' }],
      callerTeamIds: null,
    });
    setParticipationInclusions.mockResolvedValue(undefined);
    askAvailability.mockImplementation(
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

    await screen.findByTestId(
      'prepare-event-time-block-row-event-time-block-1',
    );
    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));
    await screen.findByTestId('prepare-touched-count');
    await user.click(screen.getByTestId('save-and-ask-availability-button'));
    await user.click(await screen.findByTestId('prepare-send-confirm'));

    expect(() => {
      router.navigate({ to: '/schedules' });
      unmount();
    }).not.toThrow();
  });
});
