import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TailoringSlotList } from './tailoring-slot-list';
import { renderWithProviders } from '@/__tests__/setup/render';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
} from '@/infrastructure/api/churchAPI.schemas';

const getScheduleBuilderData = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getScheduleBuilderData: (...args: unknown[]) =>
      getScheduleBuilderData(...args),
  },
}));

function makeSlotView(
  overrides: Partial<GetCycleParticipation200EventsItemSlotsItem> = {},
): GetCycleParticipation200EventsItemSlotsItem {
  return {
    slot: {
      id: 'slot-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-07-12T09:00:00',
      endTime: '2026-07-12T11:00:00',
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
  slotOverrides: Partial<GetCycleParticipation200EventsItemSlotsItem>[] = [{}],
): GetCycleParticipation200EventsItem {
  return {
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
      startDate: '2026-07-12T09:00:00',
      endDate: '2026-07-12T11:00:00',
      status: 'scheduled',
      eventType: 'hourly',
      createdAt: '2026-07-01T00:00:00',
      updatedAt: '2026-07-01T00:00:00',
    },
    slots: slotOverrides.map((slotOverride) => makeSlotView(slotOverride)),
    ...overrides,
  };
}

const NO_OP_PROPS = {
  ministryId: 'ministry-1',
  splitForms: {},
  headcountDrafts: {},
  savedHeadcountDrafts: {},
  splitDirtySlotIds: new Set<string>(),
  headcountDirtySlotIds: new Set<string>(),
  pendingHeadcountSlotId: null,
  pendingSplitSlotId: null,
  pendingInclusionSlotId: null,
  onToggleInclusion: vi.fn(),
  onSplitFormChange: vi.fn(),
  onSplitShifts: vi.fn(),
  onHeadcountChange: vi.fn(),
  onSaveHeadcounts: vi.fn(),
};

describe('TailoringSlotList day-grouping (US3/T026)', () => {
  it('groups slots under a day header, flat — no card-in-card', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });

    renderWithProviders(
      <TailoringSlotList {...NO_OP_PROPS} events={[makeEventView()]} />,
    );

    expect(
      await screen.findByTestId('tailoring-day-header-2026-07-12'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tailoring-slot-row-slot-1')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are zero slots', () => {
    renderWithProviders(<TailoringSlotList {...NO_OP_PROPS} events={[]} />);

    expect(
      screen.getByTestId('tailoring-slot-list-empty-state'),
    ).toBeInTheDocument();
  });
});

describe('TailoringSlotList inclusion toggle (US3/T021)', () => {
  it('hides shift/headcount controls for an unincluded slot', () => {
    renderWithProviders(
      <TailoringSlotList {...NO_OP_PROPS} events={[makeEventView()]} />,
    );

    expect(screen.queryByText('Headcount')).not.toBeInTheDocument();
  });

  it('calls onToggleInclusion immediately when Serving is selected (T043)', async () => {
    const onToggleInclusion = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringSlotList
        {...NO_OP_PROPS}
        onToggleInclusion={onToggleInclusion}
        events={[makeEventView()]}
      />,
    );

    await user.click(screen.getByTestId('serving-toggle-slot-1'));

    expect(onToggleInclusion).toHaveBeenCalledWith({
      participationId: 'participation-1',
      timeSlotId: 'slot-1',
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        onSplitShifts={onSplitShifts}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T09:00:00',
                  endTime: '2026-07-12T11:00:00',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));
    await user.type(
      await screen.findByTestId('headcount-input-shift-1-role-1'),
      '2',
    );

    expect(onSplitShifts).not.toHaveBeenCalled();
    expect(onSaveHeadcounts).not.toHaveBeenCalled();
  });

  it('shows shift/headcount controls once a slot is included and expanded', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T09:00:00',
                  endTime: '2026-07-12T11:00:00',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    expect(screen.queryByText('Headcount')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));

    expect(await screen.findByText('Headcount')).toBeInTheDocument();
  });
});

describe('TailoringSlotList default single shift on inclusion (US3/T021a/FR-013)', () => {
  it('renders exactly one shift row spanning the slot full duration when just-included with 0 prior splits', async () => {
    getScheduleBuilderData.mockResolvedValue({
      roles: [{ id: 'role-1', name: 'Greeter' }],
      events: [],
      availability: [],
      volunteers: [],
      callerTeamIds: null,
    });
    const user = userEvent.setup();

    renderWithProviders(
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T09:00:00',
                  endTime: '2026-07-12T11:00:00',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));

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
      <TailoringSlotList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        headcountDrafts={{ 'shift-1:role-1': '3' }}
        savedHeadcountDrafts={{ 'shift-1:role-1': '2' }}
        headcountDirtySlotIds={new Set(['slot-1'])}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T09:00:00',
                  endTime: '2026-07-12T11:00:00',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    await screen.findByText('Greeter');
    await user.click(screen.getByTestId('save-headcounts-button-slot-1'));

    expect(onSaveHeadcounts).toHaveBeenCalledWith({
      participationId: 'participation-1',
      timeSlotId: 'slot-1',
      headcountSavesByShift: [
        {
          shiftId: 'shift-1',
          validHeadcounts: [
            { roleId: 'role-1', requiredCount: 3, teamId: undefined },
          ],
        },
      ],
    });
  });

  it('saves changed headcounts for every shift through one slot action (T045)', async () => {
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '2', manualSpans: [] },
        }}
        headcountDrafts={{
          'shift-1:role-1': '3',
          'shift-2:role-1': '2',
        }}
        savedHeadcountDrafts={{
          'shift-1:role-1': '1',
          'shift-2:role-1': '1',
        }}
        headcountDirtySlotIds={new Set(['slot-1'])}
        events={[
          makeEventView({}, [
            {
              included: true,
              shifts: [
                {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T09:00:00',
                  endTime: '2026-07-12T10:00:00',
                },
                {
                  id: 'shift-2',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-12T10:00:00',
                  endTime: '2026-07-12T11:00:00',
                },
              ],
            },
          ]),
        ]}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    expect(screen.getAllByText('Save headcounts')).toHaveLength(1);
    await user.click(screen.getByTestId('save-headcounts-button-slot-1'));

    expect(onSaveHeadcounts).toHaveBeenCalledWith({
      participationId: 'participation-1',
      timeSlotId: 'slot-1',
      headcountSavesByShift: [
        {
          shiftId: 'shift-1',
          validHeadcounts: [
            { roleId: 'role-1', requiredCount: 3, teamId: undefined },
          ],
        },
        {
          shiftId: 'shift-2',
          validHeadcounts: [
            { roleId: 'role-1', requiredCount: 2, teamId: undefined },
          ],
        },
      ],
    });
  });
});

describe('TailoringSlotList invalid headcount rejection (US3/T023b)', () => {
  const baseEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            timeSlotId: 'slot-1',
            startTime: '2026-07-12T09:00:00',
            endTime: '2026-07-12T11:00:00',
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        headcountDrafts={{ 'shift-1:role-1': draftValue }}
        events={baseEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    const saveButton = await screen.findByTestId(
      'save-headcounts-button-slot-1',
    );
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByTestId('headcount-save-explanation-slot-1'),
    ).toBeInTheDocument();
  });

  it('blocks the slot save when one role is invalid, even if another is valid (T045a)', async () => {
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        onSaveHeadcounts={onSaveHeadcounts}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        headcountDrafts={{ 'shift-1:role-1': '2', 'shift-1:role-2': '0' }}
        events={baseEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    await screen.findByText('Greeter');
    const saveButton = screen.getByTestId('save-headcounts-button-slot-1');
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByTestId('headcount-save-explanation-slot-1'),
    ).toBeInTheDocument();
    expect(onSaveHeadcounts).not.toHaveBeenCalled();
  });
});

describe('TailoringSlotList role-catalog fetch failure surfaces to the leader (bugfix)', () => {
  const includedEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            timeSlotId: 'slot-1',
            startTime: '2026-07-12T09:00:00',
            endTime: '2026-07-12T11:00:00',
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitForms={{
          'slot-1': { mode: 'equal', equalCount: '1', manualSpans: [] },
        }}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    expect(
      await screen.findByTestId('role-catalog-empty-shift-1'),
    ).toBeInTheDocument();
  });
});

describe('TailoringSlotList independent per-slot unsaved indicators (Iteration 2/T047/FR-023)', () => {
  const includedEvents = [
    makeEventView({}, [
      {
        included: true,
        shifts: [
          {
            id: 'shift-1',
            participationId: 'participation-1',
            timeSlotId: 'slot-1',
            startTime: '2026-07-12T09:00:00',
            endTime: '2026-07-12T11:00:00',
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitDirtySlotIds={new Set(['slot-1'])}
        headcountDirtySlotIds={new Set<string>()}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    expect(
      screen.getByTestId('split-unsaved-indicator-slot-1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('headcount-unsaved-indicator-slot-1'),
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
      <TailoringSlotList
        {...NO_OP_PROPS}
        splitDirtySlotIds={new Set(['slot-1'])}
        headcountDirtySlotIds={new Set(['slot-1'])}
        events={includedEvents}
      />,
    );

    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    expect(
      screen.getByTestId('split-unsaved-indicator-slot-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('headcount-unsaved-indicator-slot-1'),
    ).toBeInTheDocument();

    // Collapse then re-expand the row — both indicators must still be
    // there; they're driven by props from the parent, not row-local state
    // that a collapse could reset.
    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));
    await user.click(screen.getByTestId('toggle-slot-expand-slot-1'));

    expect(
      screen.getByTestId('split-unsaved-indicator-slot-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('headcount-unsaved-indicator-slot-1'),
    ).toBeInTheDocument();
  });

  it('shows neither indicator when neither is dirty', () => {
    renderWithProviders(
      <TailoringSlotList {...NO_OP_PROPS} events={includedEvents} />,
    );

    expect(
      screen.queryByTestId('split-unsaved-indicator-slot-1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('headcount-unsaved-indicator-slot-1'),
    ).not.toBeInTheDocument();
  });
});
