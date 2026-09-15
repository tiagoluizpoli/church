import { screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CycleBuilderData } from '../../../hooks/use-cycle-builder';
import { CycleBuilderMatrix } from './cycle-builder-matrix';
import { renderWithProviders } from '@/__tests__/setup/render';

/**
 * Regression guard for the phantom-day bug: a church-local Monday is stored as
 * local midnight → local 23:59, which west of the Church Timezone's own UTC
 * offset straddles two UTC dates. The board used to span the event's raw UTC
 * bounds (or the browser's own timezone) and so grew an extra column for the
 * following day, re-rendering the same shift ids under it — one assignment
 * looking like it had been written to both days.
 *
 * The Church Timezone (São Paulo, west of UTC) is passed explicitly and never
 * changes; the *ambient* process `TZ` — standing in for the browser's own
 * zone — is parametrized west and east of UTC to prove grouping comes from
 * the Church Timezone argument alone, never from the browser's.
 */
const ORIGINAL_TZ = process.env.TZ;
const CHURCH_TIMEZONE = 'America/Sao_Paulo';

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

function renderBoard(data: CycleBuilderData = janeiroData) {
  return renderWithProviders(
    <CycleBuilderMatrix
      data={data}
      cycleStartDate="2027-01-01T00:00:00.000Z"
      cycleEndDate="2027-01-31T00:00:00.000Z"
      selectedDate={null}
      onSelectedDateChange={vi.fn()}
      onSelectVolunteer={vi.fn()}
      onSelectAssignment={vi.fn()}
      onRemoveAssignment={vi.fn()}
    />,
    { churchTimezone: CHURCH_TIMEZONE },
  );
}

describe.each([
  ['a west-of-UTC ambient TZ', 'America/Los_Angeles'],
  ['an east-of-UTC ambient TZ', 'Asia/Kolkata'],
])('CycleBuilderMatrix date columns, under %s', (_label, ambientTz) => {
  beforeAll(() => {
    process.env.TZ = ambientTz;
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('shows only the two Mondays the cycle actually serves', async () => {
    renderBoard();

    expect(await screen.findAllByText('Mon, 04/01')).not.toHaveLength(0);
    expect(screen.getAllByText('Mon, 11/01')).not.toHaveLength(0);
    expect(screen.queryByText('Tue, 05/01')).not.toBeInTheDocument();
    expect(screen.queryByText('Tue, 12/01')).not.toBeInTheDocument();
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

  it('renders a shift crossing church-local midnight under its start CalendarDay only', async () => {
    // 22:00 on Friday 2027-01-08 in São Paulo (UTC-3) is 01:00Z Saturday;
    // the shift ends 01:00 Saturday church-local (04:00Z). US4 (#151): the
    // shift itself renders under Friday, its start day — never duplicated
    // onto Saturday by a UTC/browser-timezone read.
    const lateFridayData: CycleBuilderData = {
      assignments: [],
      roles: [{ id: 'role-1', name: 'Coordinator' }],
      events: [
        {
          participationId: 'participation-late-friday',
          state: 'rostering',
          eventId: 'event-late-friday',
          title: 'vigília noturna',
          startDate: '2027-01-09T01:00:00.000Z',
          endDate: '2027-01-09T04:00:00.000Z',
          status: 'scheduled',
          eventType: 'hourly',
          fillRatio: 0,
          requiredCount: 1,
          assignedCount: 0,
          slotCount: 1,
          slots: [
            {
              slotId: 'slot-vigilia',
              label: 'vigília',
              startTime: '2027-01-09T01:00:00.000Z',
              endTime: '2027-01-09T04:00:00.000Z',
              included: true,
              requiredCount: 1,
              assignedCount: 0,
              shiftCount: 1,
              shifts: [
                {
                  shiftId: 'shift-vigilia',
                  slotId: 'slot-vigilia',
                  startTime: '2027-01-09T01:00:00.000Z',
                  endTime: '2027-01-09T04:00:00.000Z',
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

    renderBoard(lateFridayData);

    // "Fri, 08/01" also appears on the date-strip focus button; the board
    // column's own copy is the `<p>` heading inside its `<section>`.
    const fridayLabels = await screen.findAllByText('Fri, 08/01');
    const fridayHeading = fridayLabels.find(
      (element) => element.tagName === 'P',
    );
    const fridayColumn = fridayHeading?.closest('section');
    if (!fridayColumn) throw new Error('Friday column not found');

    // Rendered exactly once, and only under Friday — never duplicated onto
    // Saturday, which is exactly the phantom-day shape this guards against.
    expect(
      await within(fridayColumn).findAllByTestId(
        'cycle-requirement-shift-vigilia-role-1',
      ),
    ).toHaveLength(1);
    expect(
      screen.queryAllByTestId('cycle-requirement-shift-vigilia-role-1'),
    ).toHaveLength(1);

    // The event's own card/title is the AC2 regression this guards against:
    // a range-check `eventOccursOnDay` rendered the whole event card a
    // second time under Saturday, not just the shift inside it.
    expect(await screen.findAllByText('vigília noturna')).toHaveLength(1);
    expect(
      within(fridayColumn).getByText('vigília noturna'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sat, 09/01')).not.toBeInTheDocument();
  });
});
