import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';
import { renderWithProviders } from '@/tests/setup/render';
import { adminApi } from '@/utils/api-instances';

interface ShiftCase {
  name: string;
  startTime?: string;
  eventStatus?: string;
  cancelled?: boolean;
  peopleNeeded?: number;
  roleHolders?: boolean;
}

interface Expected {
  add: boolean;
  editAssignment: boolean;
  dropTarget: boolean;
  startedNotice: boolean;
  noHolderNotice: boolean;
  struckCount: boolean;
  railAssign: boolean;
  proposalPick: boolean;
  /** null: no Publish button at all. */
  publish: string | null;
}

beforeEach(() => {
  overwriteGetLocale(() => 'en');
  setTestClock({
    instant: parseInstant({ value: '2026-08-01T12:00:00.000Z' }),
  });
});

afterEach(() => {
  resetClock();
  vi.restoreAllMocks();
});

const assignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  eventTimeBlockId: 'block-1',
  participationId: 'participation-1',
  shiftId: 'shift-1',
  volunteerId: 'grace',
  roleId: 'role-1',
  shiftRequirementId: 'requirement-1',
  status: 'pending',
  assignedAt: '2026-07-01T10:00:00.000Z',
  lateMark: false,
  volunteerName: 'Grace Hopper',
} as const;

function boardData({
  startTime = '2026-08-02T09:00:00.000Z',
  eventStatus = 'scheduled',
  cancelled = false,
  peopleNeeded = 2,
  roleHolders = true,
}: ShiftCase): CycleBuilderData {
  const endTime = '2026-08-02T11:00:00.000Z';
  const counts = { peopleNeeded, assignedCount: 1 };
  const eligibleVolunteers = ['Grace Hopper', 'Ada Lovelace'].map((name) => ({
    volunteerId: name.split(' ')[0].toLowerCase(),
    volunteerName: name,
    answerState: 'available' as const,
    conflict: null,
    qualifiedRoleIds: roleHolders ? ['role-1'] : [],
    ministryAccessLevel: 'volunteer' as const,
  }));
  return {
    assignments: [assignment],
    roles: [{ id: 'role-1', name: 'Greeter' }],
    events: [
      {
        ...counts,
        participationId: 'participation-1',
        state: 'assigning',
        eventId: 'event-1',
        title: 'Sunday Gathering',
        start: startTime,
        end: endTime,
        status: eventStatus,
        fillRatio: 0,
        eventTimeBlockCount: 1,
        eventTimeBlocks: [
          {
            ...counts,
            eventTimeBlockId: 'block-1',
            label: 'Morning service',
            startTime,
            endTime,
            cancelled,
            included: true,
            shiftCount: 1,
            shifts: [
              {
                ...counts,
                shiftId: 'shift-1',
                label: 'Morning service',
                eventTimeBlockId: 'block-1',
                startTime,
                endTime,
                cancelled,
                requirements: [
                  {
                    id: 'requirement-1',
                    roleId: 'role-1',
                    sectorName: 'Main',
                    peopleNeeded,
                  },
                ],
                assignments: [assignment],
                eligibleVolunteerCount: 2,
                eligibleVolunteers,
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderBuilder(data: CycleBuilderData) {
  const mutation = { isPending: false, mutateAsync: vi.fn() };
  renderWithProviders(
    <CycleBuilder
      data={data}
      selectedDates={[]}
      onSelectedDatesChange={vi.fn()}
      onPublish={vi.fn()}
      isPublishing={false}
      cycleId="cycle-1"
      ministryId="ministry-1"
      cycleStartDate="2026-08-01"
      cycleEndDate="2026-08-31"
      createAssignment={mutation}
      deleteAssignment={mutation}
      reassignAssignment={mutation}
      moveAssignment={mutation}
    />,
  );
}

const open: Expected = {
  add: true,
  editAssignment: true,
  dropTarget: true,
  startedNotice: false,
  noHolderNotice: false,
  struckCount: false,
  railAssign: true,
  proposalPick: true,
  publish: m.builder_ui_publish_gaps(
    { places: 1, shifts: 1 },
    { locale: 'en' },
  ),
};
const closed: Expected = {
  ...open,
  add: false,
  editAssignment: false,
  dropTarget: false,
  railAssign: false,
};
const cancelledBlock: Expected = {
  ...closed,
  struckCount: true,
  proposalPick: false,
  publish: m.builder_ui_publish_full({}, { locale: 'en' }),
};

const cases: [ShiftCase, Expected][] = [
  [{ name: 'normal Shift' }, open],
  [{ name: 'cancelled block', cancelled: true }, cancelledBlock],
  [
    { name: 'cancelled Event', cancelled: true, eventStatus: 'cancelled' },
    { ...cancelledBlock, publish: null },
  ],
  [
    // The server never proposes a started Shift; the preview shows what it is
    // sent, and the publish gate still counts its empty place.
    { name: 'started Shift', startTime: '2026-08-01T09:00:00.000Z' },
    { ...closed, startedNotice: true },
  ],
  [
    { name: 'full requirement', peopleNeeded: 1 },
    {
      ...open,
      add: false,
      dropTarget: false,
      railAssign: false,
      publish: m.builder_ui_publish_full({}, { locale: 'en' }),
    },
  ],
  [
    { name: 'Shift with no role holder', roleHolders: false },
    { ...open, noHolderNotice: true, railAssign: false },
  ],
];

describe.each(cases)('Schedule builder: $name', (shiftCase, expected) => {
  it('allows this in the cell', () => {
    renderBuilder(boardData(shiftCase));
    const cell = screen.getByTestId('cycle-requirement-requirement-1');
    const inCell = within(cell);
    expect(
      Boolean(inCell.queryByRole('button', { name: m.builder_ui_add() })),
    ).toBe(expected.add);
    expect(inCell.getByText('Grace Hopper')).toBeInTheDocument();
    expect(
      Boolean(inCell.queryByRole('button', { name: /Grace Hopper/ })),
    ).toBe(expected.editAssignment);
    expect(cell.getAttribute('data-drop-target')).toBe(
      expected.dropTarget ? 'append' : null,
    );
    expect(Boolean(inCell.queryByText(/started at .* and is read-only/))).toBe(
      expected.startedNotice,
    );
    expect(
      Boolean(
        inCell.queryByText(m.builder_no_role_holders({ role: 'Greeter' })),
      ),
    ).toBe(expected.noHolderNotice);
    const count = inCell.getByText(`1/${shiftCase.peopleNeeded ?? 2}`);
    expect(count.classList.contains('line-through')).toBe(expected.struckCount);
  });

  it('allows this from the side rail', async () => {
    renderBuilder(boardData(shiftCase));
    await userEvent.click(
      screen.getByTestId('cycle-requirement-focus-requirement-1'),
    );
    const rail = within(screen.getByTestId('volunteer-pool'));
    expect(
      Boolean(
        rail.queryByRole('button', {
          name: m.builder_ui_pick_me_person({ name: 'Ada Lovelace' }),
          hidden: true,
        }),
      ),
    ).toBe(expected.railAssign);
  });

  it('shows this in the proposal preview', async () => {
    vi.spyOn(adminApi, 'getAssignmentProposal').mockResolvedValue({
      additions: [
        {
          volunteerId: 'ada',
          volunteerName: 'Ada Lovelace',
          shiftRequirementId: 'requirement-1',
          shiftId: 'shift-1',
          reason: {
            eligibleShiftCount: 1,
            needCandidateCount: 2,
            decidedBy: 'fewest_cycle_assignments',
          },
        },
      ],
      gaps: [],
      excludedUnconfirmedCount: 0,
      emptyReason: null,
      reviewToken: 'token',
    });
    renderBuilder(boardData(shiftCase));
    // A cancelled Event offers no proposal at all.
    if (shiftCase.eventStatus === 'cancelled') {
      expect(
        screen.getByRole('button', { name: m.builder_proposal_open() }),
      ).toHaveAttribute('aria-disabled', 'true');
      return;
    }
    await userEvent.click(
      screen.getByRole('button', { name: m.builder_proposal_open() }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryAllByText('Ada Lovelace').length > 0).toBe(
      expected.proposalPick,
    );
  });

  it('gates publishing like this', async () => {
    renderBuilder(boardData(shiftCase));
    const publish = screen.queryByRole('button', {
      name: m.builder_ui_publish(),
    });
    if (expected.publish === null) {
      expect(publish).not.toBeInTheDocument();
      return;
    }
    await userEvent.click(publish as HTMLElement);
    expect(screen.getByText(expected.publish)).toBeInTheDocument();
  });
});
