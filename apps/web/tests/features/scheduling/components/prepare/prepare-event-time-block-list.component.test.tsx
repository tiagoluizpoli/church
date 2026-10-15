import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrepareEventTimeBlockList } from '@/features/scheduling/components/prepare/prepare-event-time-block-list';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const getScheduleBuilderData = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getScheduleBuilderData: (...args: unknown[]) =>
      getScheduleBuilderData(...args),
  },
}));

function makeEventTimeBlockView(
  overrides: Partial<GetCycleParticipation200EventsItemEventTimeBlocksItem> = {},
): GetCycleParticipation200EventsItemEventTimeBlocksItem {
  return {
    eventTimeBlock: {
      id: 'event-time-block-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-07-12T09:00:00.000Z',
      endTime: '2026-07-12T11:00:00.000Z',
      label: 'Greeter',
      status: 'active',
      requirements: [],
    },
    included: false,
    shifts: [],
    requirements: [],
    ...overrides,
  };
}

function makeEventView(
  overrides: Partial<GetCycleParticipation200EventsItem> = {},
  eventTimeBlockOverrides: Partial<GetCycleParticipation200EventsItemEventTimeBlocksItem>[] = [
    {},
  ],
): GetCycleParticipation200EventsItem {
  return {
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
      start: '2026-07-12T09:00:00',
      end: '2026-07-12T11:00:00',
      status: 'scheduled',
      createdAt: '2026-07-01T00:00:00',
      updatedAt: '2026-07-01T00:00:00',
    },
    eventTimeBlocks: eventTimeBlockOverrides.map((eventTimeBlockOverride) =>
      makeEventTimeBlockView(eventTimeBlockOverride),
    ),
    ...overrides,
  };
}

const NO_OP_PROPS = {
  ministryId: 'ministry-1',
  splitForms: {},
  headcountDrafts: {},
  savedHeadcountDrafts: {},
  splitDirtyEventTimeBlockIds: new Set<string>(),
  headcountDirtyEventTimeBlockIds: new Set<string>(),
  pendingHeadcountEventTimeBlockId: null,
  pendingSplitEventTimeBlockId: null,
  pendingInclusionEventTimeBlockId: null,
  onToggleInclusion: vi.fn(),
  onSplitFormChange: vi.fn(),
  onSplitShifts: vi.fn(),
  onHeadcountChange: vi.fn(),
  onSaveHeadcounts: vi.fn(),
};

describe('PrepareEventTimeBlockList day-grouping (US3/T026)', () => {
  it('groups time blocks under a day header, flat — no card-in-card', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });

    renderWithProviders(
      <PrepareEventTimeBlockList {...NO_OP_PROPS} events={[makeEventView()]} />,
    );

    expect(
      await screen.findByTestId('prepare-day-header-2026-07-12'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('prepare-event-time-block-row-event-time-block-1'),
    ).toBeInTheDocument();
  });

  it('renders an empty-state message when there are zero time blocks', () => {
    renderWithProviders(
      <PrepareEventTimeBlockList {...NO_OP_PROPS} events={[]} />,
    );

    expect(
      screen.getByTestId('prepare-event-time-block-list-empty-state'),
    ).toBeInTheDocument();
  });
});

describe('PrepareEventTimeBlockList inclusion toggle (US3/T021)', () => {
  it('hides shift/headcount controls for an unincluded time block', () => {
    renderWithProviders(
      <PrepareEventTimeBlockList {...NO_OP_PROPS} events={[makeEventView()]} />,
    );

    expect(screen.queryByText('Headcount')).not.toBeInTheDocument();
  });

  it('calls onToggleInclusion immediately when Serving is selected (T043)', async () => {
    const onToggleInclusion = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onToggleInclusion={onToggleInclusion}
        events={[makeEventView()]}
      />,
    );

    await user.click(screen.getByTestId('serving-toggle-event-time-block-1'));

    expect(onToggleInclusion).toHaveBeenCalledWith({
      participationId: 'participation-1',
      eventTimeBlockId: 'event-time-block-1',
      checked: true,
    });
  });

  it('keeps split and headcount edits local until their save actions are clicked (T043)', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const onSplitShifts = vi.fn();
    const onSaveHeadcounts = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onSplitShifts={onSplitShifts}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T11:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));
    await user.type(
      await screen.findByTestId('headcount-input-shift-1-role-1'),
      '2',
    );

    expect(onSplitShifts).not.toHaveBeenCalled();
    expect(onSaveHeadcounts).not.toHaveBeenCalled();
  });

  it('shows shift/headcount controls once a time block is included and expanded', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T11:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    expect(screen.queryByText('Headcount')).not.toBeInTheDocument();
    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );

    expect(await screen.findByText('Headcount')).toBeInTheDocument();
  });
});

describe('PrepareEventTimeBlockList default single shift on inclusion (US3/T021a/FR-013)', () => {
  it('renders exactly one shift row spanning the time block full duration when just-included with 0 prior splits', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T11:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );

    await screen.findByTestId('participation-shift-row-shift-1');
    expect(
      screen.queryByTestId('participation-shift-row-shift-2'),
    ).not.toBeInTheDocument();
  });

  it('persists a headcount value through the existing upsert mutation', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const onSaveHeadcounts = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        headcountDrafts={{ 'shift-1:role-1': '3' }}
        savedHeadcountDrafts={{ 'shift-1:role-1': '2' }}
        headcountDirtyEventTimeBlockIds={new Set(['event-time-block-1'])}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T11:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    await screen.findByText('Greeter');
    await user.click(
      screen.getByTestId('save-headcounts-button-event-time-block-1'),
    );

    expect(onSaveHeadcounts).toHaveBeenCalledWith({
      participationId: 'participation-1',
      eventTimeBlockId: 'event-time-block-1',
      headcountSavesByShift: [
        {
          shiftId: 'shift-1',
          validHeadcounts: [
            { roleId: 'role-1', peopleNeeded: 3, teamId: undefined },
          ],
        },
      ],
    });
  });

  it('saves changed headcounts for every shift through one time block action (T045)', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const onSaveHeadcounts = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '2',
            manualSpans: [],
          },
        }}
        headcountDrafts={{
          'shift-1:role-1': '3',
          'shift-2:role-1': '2',
        }}
        savedHeadcountDrafts={{
          'shift-1:role-1': '1',
          'shift-2:role-1': '1',
        }}
        headcountDirtyEventTimeBlockIds={new Set(['event-time-block-1'])}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T10:00:00.000Z',
                },
                {
                  id: 'shift-2',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  startTime: '2026-07-12T10:00:00.000Z',
                  endTime: '2026-07-12T11:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(screen.getAllByText('Save headcounts')).toHaveLength(1);
    await user.click(
      screen.getByTestId('save-headcounts-button-event-time-block-1'),
    );

    expect(onSaveHeadcounts).toHaveBeenCalledWith({
      participationId: 'participation-1',
      eventTimeBlockId: 'event-time-block-1',
      headcountSavesByShift: [
        {
          shiftId: 'shift-1',
          validHeadcounts: [
            { roleId: 'role-1', peopleNeeded: 3, teamId: undefined },
          ],
        },
        {
          shiftId: 'shift-2',
          validHeadcounts: [
            { roleId: 'role-1', peopleNeeded: 2, teamId: undefined },
          ],
        },
      ],
    });
  });
});

describe('PrepareEventTimeBlockList invalid headcount rejection (US3/T023b)', () => {
  const baseEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            eventTimeBlockId: 'event-time-block-1',
            startTime: '2026-07-12T09:00:00.000Z',
            endTime: '2026-07-12T11:00:00.000Z',
          },
        ],
      },
    ]),
  ];

  it.each([
    ['0', '0'],
    ['-1', 'negative'],
    ['1.5', 'non-integer'],
    ['abc', 'non-numeric'],
    ['', 'empty'],
  ])('disables Save and never calls onSaveHeadcounts with a %s (%s) draft value', async (draftValue) => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const onSaveHeadcounts = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        headcountDrafts={{ 'shift-1:role-1': draftValue }}
        events={baseEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    const saveButton = await screen.findByTestId(
      'save-headcounts-button-event-time-block-1',
    );
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByTestId('headcount-save-explanation-event-time-block-1'),
    ).toBeInTheDocument();
  });

  it('blocks the time block save when one role is invalid, even if another is valid (T045a)', async () => {
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
    const onSaveHeadcounts = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        headcountDrafts={{ 'shift-1:role-1': '2', 'shift-1:role-2': '0' }}
        events={baseEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    await screen.findByText('Greeter');
    const saveButton = screen.getByTestId(
      'save-headcounts-button-event-time-block-1',
    );
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByTestId('headcount-save-explanation-event-time-block-1'),
    ).toBeInTheDocument();
    expect(onSaveHeadcounts).not.toHaveBeenCalled();
  });
});

describe('PrepareEventTimeBlockList role-catalog fetch failure surfaces to the leader (bugfix)', () => {
  const includedEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            eventTimeBlockId: 'event-time-block-1',
            startTime: '2026-07-12T09:00:00.000Z',
            endTime: '2026-07-12T11:00:00.000Z',
          },
        ],
      },
    ]),
  ];

  it('shows a loading message instead of a silent blank while the role catalog is in flight', async () => {
    let resolveRoles: (() => void) | undefined;
    getScheduleBuilderData.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRoles = () =>
            resolve({
              roles: [],
              events: [],
              availability: [],
              volunteers: [],
              callerTeamIds: null,
            });
        }),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(
      await screen.findByTestId('role-catalog-loading-shift-1'),
    ).toBeInTheDocument();
    resolveRoles?.();
  });

  it('shows a retryable error instead of silently rendering zero headcount inputs when the role fetch fails (e.g. a 403)', async () => {
    getScheduleBuilderData.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(
      await screen.findByTestId('role-catalog-error-shift-1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('headcount-input-shift-1-role-1'),
    ).not.toBeInTheDocument();
  });

  it('retries the role-catalog fetch when Retry is clicked', async () => {
    getScheduleBuilderData
      .mockRejectedValueOnce({ isAxiosError: true, message: 'Network Error' })
      .mockResolvedValue({
        roles: [{ id: 'role-1', name: 'Greeter' }],
        events: [],
        availability: [],
        volunteers: [],
        callerTeamIds: null,
      });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    await screen.findByTestId('role-catalog-error-shift-1');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Greeter')).toBeInTheDocument();
  });

  it('shows a distinct empty-state (not a silent blank) when the ministry genuinely has zero roles configured', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(
      await screen.findByTestId('role-catalog-empty-shift-1'),
    ).toBeInTheDocument();
  });
});

describe('PrepareEventTimeBlockList independent per-time-block unsaved indicators (Iteration 2/T047/FR-023)', () => {
  const includedEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            eventTimeBlockId: 'event-time-block-1',
            startTime: '2026-07-12T09:00:00.000Z',
            endTime: '2026-07-12T11:00:00.000Z',
          },
        ],
      },
    ]),
  ];

  it('shows the split and headcount unsaved indicators independently — one dirty flag never implies the other', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitDirtyEventTimeBlockIds={new Set(['event-time-block-1'])}
        headcountDirtyEventTimeBlockIds={new Set<string>()}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(
      screen.getByTestId('split-unsaved-indicator-event-time-block-1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('headcount-unsaved-indicator-event-time-block-1'),
    ).not.toBeInTheDocument();
  });

  it('shows both indicators together when both are dirty, and both survive a collapse/expand cycle of the same row', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitDirtyEventTimeBlockIds={new Set(['event-time-block-1'])}
        headcountDirtyEventTimeBlockIds={new Set(['event-time-block-1'])}
        events={includedEvents}
      />,
    );

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    expect(
      screen.getByTestId('split-unsaved-indicator-event-time-block-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('headcount-unsaved-indicator-event-time-block-1'),
    ).toBeInTheDocument();

    // Collapse then re-expand the row — both indicators must still be
    // there; they're driven by props from the parent, not row-local state
    // that a collapse could reset.
    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );
    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );

    expect(
      screen.getByTestId('split-unsaved-indicator-event-time-block-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('headcount-unsaved-indicator-event-time-block-1'),
    ).toBeInTheDocument();
  });

  it('shows neither indicator when neither is dirty', () => {
    renderWithProviders(
      <PrepareEventTimeBlockList {...NO_OP_PROPS} events={includedEvents} />,
    );

    expect(
      screen.queryByTestId('split-unsaved-indicator-event-time-block-1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('headcount-unsaved-indicator-event-time-block-1'),
    ).not.toBeInTheDocument();
  });
});

describe('PrepareEventTimeBlockList exact-string display under a non-UTC ambient TZ (#159)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the EventTimeBlock day header and a Shift time range as exact dd/MM/yyyy / HH:mm strings, driven by the Church Timezone param rather than the ambient TZ', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <PrepareEventTimeBlockList
        {...NO_OP_PROPS}
        splitForms={{
          'event-time-block-1': {
            mode: 'equal',
            equalCount: '1',
            manualSpans: [],
          },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  eventTimeBlockId: 'event-time-block-1',
                  // A sub-range of the time block's own 09:00–11:00Z window, so the
                  // shift's rendered range is distinct from the time block's own.
                  startTime: '2026-07-12T09:00:00.000Z',
                  endTime: '2026-07-12T10:00:00.000Z',
                },
              ],
            },
          ]),
        ]}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    expect(
      await screen.findByTestId('prepare-day-header-2026-07-12'),
    ).toHaveTextContent('12/07/2026');

    await user.click(
      screen.getByTestId('toggle-event-time-block-expand-event-time-block-1'),
    );

    expect(
      await screen.findByText('12/07/2026 06:00 – 07:00'),
    ).toBeInTheDocument();
  });
});
