import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CycleBuilderData } from '../../../hooks/use-cycle-builder';
import { CycleBuilderMatrix } from './cycle-builder-matrix';
import { renderWithProviders } from '@/__tests__/setup/render';

/**
 * Regression guard for the phantom-day bug: a church-local Monday is stored as
 * local midnight → local 23:59, which west of UTC straddles two UTC dates. The
 * board used to span the event's raw UTC bounds and so grew an extra column for
 * the following day, re-rendering the same shift ids under it — one assignment
 * looking like it had been written to both days.
 *
 * Pinned to a west-of-UTC zone because the bug is invisible at UTC.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Mirrors the real `Janeiro` cycle: two Mondays, the first with two slots. */
const janeiroData: CycleBuilderData = {
  assignments: [],
  roles: [{ id: 'role-1', name: 'Coordinator' }],
  events: [
    {
      participationId: 'participation-1',
      state: 'rostering',
      eventId: 'event-1',
      title: 'teste',
      // Mon Jan 4 2027, 00:00 → 23:59 in São Paulo.
      startDate: '2027-01-04T03:00:00.000Z',
      endDate: '2027-01-05T02:59:59.999Z',
      status: 'scheduled',
      eventType: 'hourly',
      fillRatio: 0,
      requiredCount: 2,
      assignedCount: 0,
      slotCount: 2,
      slots: [
        {
          slotId: 'slot-manha',
          label: 'manhã',
          startTime: '2027-01-04T12:00:00.000Z',
          endTime: '2027-01-04T13:00:00.000Z',
          included: true,
          requiredCount: 1,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-manha',
              slotId: 'slot-manha',
              startTime: '2027-01-04T12:00:00.000Z',
              endTime: '2027-01-04T13:00:00.000Z',
              requiredCount: 1,
              assignedCount: 0,
              requirements: [{ roleId: 'role-1', requiredCount: 1 }],
              assignments: [],
              eligibleVolunteerCount: 0,
              eligibleVolunteers: [],
            },
          ],
        },
        {
          slotId: 'slot-tarde',
          label: 'tarde',
          startTime: '2027-01-04T19:00:00.000Z',
          endTime: '2027-01-04T21:00:00.000Z',
          included: true,
          requiredCount: 1,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-tarde',
              slotId: 'slot-tarde',
              startTime: '2027-01-04T19:00:00.000Z',
              endTime: '2027-01-04T21:00:00.000Z',
              requiredCount: 1,
              assignedCount: 0,
              requirements: [{ roleId: 'role-1', requiredCount: 1 }],
              assignments: [],
              eligibleVolunteerCount: 0,
              eligibleVolunteers: [],
            },
          ],
        },
      ],
    },
    {
      participationId: 'participation-2',
      state: 'rostering',
      eventId: 'event-2',
      title: 'segunda da benção',
      // Mon Jan 11 2027, 00:00 → 23:59 in São Paulo.
      startDate: '2027-01-11T03:00:00.000Z',
      endDate: '2027-01-12T02:59:59.999Z',
      status: 'scheduled',
      eventType: 'hourly',
      fillRatio: 0,
      requiredCount: 1,
      assignedCount: 0,
      slotCount: 1,
      slots: [
        {
          slotId: 'slot-manha-2',
          label: 'manhã',
          startTime: '2027-01-11T12:00:00.000Z',
          endTime: '2027-01-11T15:00:00.000Z',
          included: true,
          requiredCount: 1,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-manha-2',
              slotId: 'slot-manha-2',
              startTime: '2027-01-11T12:00:00.000Z',
              endTime: '2027-01-11T15:00:00.000Z',
              requiredCount: 1,
              assignedCount: 0,
              requirements: [{ roleId: 'role-1', requiredCount: 1 }],
              assignments: [],
              eligibleVolunteerCount: 0,
              eligibleVolunteers: [],
            },
          ],
        },
      ],
    },
  ],
};

function renderBoard() {
  return renderWithProviders(
    <CycleBuilderMatrix
      data={janeiroData}
      cycleStartDate="2027-01-01T00:00:00.000Z"
      cycleEndDate="2027-01-31T00:00:00.000Z"
      selectedDate={null}
      onSelectedDateChange={vi.fn()}
      onSelectVolunteer={vi.fn()}
      onSelectAssignment={vi.fn()}
      onRemoveAssignment={vi.fn()}
    />,
  );
}

describe('CycleBuilderMatrix date columns', () => {
  it('shows only the two Mondays the cycle actually serves', async () => {
    renderBoard();

    expect(await screen.findAllByText('Mon, Jan 4')).not.toHaveLength(0);
    expect(screen.getAllByText('Mon, Jan 11')).not.toHaveLength(0);
    expect(screen.queryByText('Tue, Jan 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Tue, Jan 12')).not.toBeInTheDocument();
  });

  it('renders each shift in exactly one column', async () => {
    renderBoard();

    // The bleed: a shift duplicated across a real and a phantom column made one
    // assignment appear on both days.
    for (const shiftId of ['shift-manha', 'shift-tarde', 'shift-manha-2']) {
      expect(
        await screen.findAllByTestId(`cycle-requirement-${shiftId}-role-1`),
      ).toHaveLength(1);
    }
  });

  it('keeps both of the first Monday slots on that one day', async () => {
    renderBoard();

    // manhã and tarde belong to the same event on the same local day: one
    // column, both slots.
    expect(await screen.findAllByText('manhã')).toHaveLength(2); // Jan 4 + Jan 11
    expect(screen.getAllByText('tarde')).toHaveLength(1);
  });
});
