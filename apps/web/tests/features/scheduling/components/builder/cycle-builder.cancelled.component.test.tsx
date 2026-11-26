import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';
import { renderWithProviders } from '@/tests/setup/render';

/**
 * Pins how the board shows a cancelled Event and a cancelled time block in a
 * live Event (#1123): struck titles and one Cancelled badge per cancellation.
 */

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

type BuilderEvent = CycleBuilderData['events'][number];

interface BlockInput {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
}

interface EventInput {
  id: string;
  title: string;
  status: string;
  blocks: BlockInput[];
}

function builderEvent({ id, title, status, blocks }: EventInput): BuilderEvent {
  const counts = { peopleNeeded: 1, assignedCount: 0 };
  return {
    ...counts,
    participationId: `participation-${id}`,
    state: 'assigning',
    eventId: id,
    title,
    start: blocks[0].startTime,
    end: blocks[blocks.length - 1].endTime,
    status,
    fillRatio: 0,
    eventTimeBlockCount: blocks.length,
    eventTimeBlocks: blocks.map((block) => ({
      ...counts,
      eventTimeBlockId: block.id,
      label: block.label,
      startTime: block.startTime,
      endTime: block.endTime,
      cancelled: block.cancelled,
      included: true,
      shiftCount: 1,
      shifts: [
        {
          ...counts,
          shiftId: `shift-${block.id}`,
          label: block.label,
          eventTimeBlockId: block.id,
          startTime: block.startTime,
          endTime: block.endTime,
          cancelled: block.cancelled,
          requirements: [
            {
              id: `requirement-${block.id}`,
              roleId: 'role-1',
              sectorName: 'Main',
              peopleNeeded: 1,
            },
          ],
          assignments: [],
          eligibleVolunteerCount: 0,
          eligibleVolunteers: [],
        },
      ],
    })),
  };
}

const data: CycleBuilderData = {
  assignments: [],
  roles: [{ id: 'role-1', name: 'Greeter' }],
  events: [
    builderEvent({
      id: 'retreat',
      title: 'Retreat',
      status: 'cancelled',
      blocks: [
        {
          id: 'retreat-block',
          label: 'Retreat block',
          startTime: '2026-08-02T12:00:00.000Z',
          endTime: '2026-08-02T13:00:00.000Z',
          cancelled: true,
        },
      ],
    }),
    builderEvent({
      id: 'sunday',
      title: 'Sunday',
      status: 'scheduled',
      blocks: [
        {
          id: 'live-block',
          label: 'Live block',
          startTime: '2026-08-02T21:00:00.000Z',
          endTime: '2026-08-02T22:00:00.000Z',
          cancelled: false,
        },
        {
          id: 'cancelled-block',
          label: 'Cancelled block',
          startTime: '2026-08-02T22:00:00.000Z',
          endTime: '2026-08-02T23:00:00.000Z',
          cancelled: true,
        },
      ],
    }),
  ],
};

function renderBuilder() {
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

const cancelledLabel = () => m.event_status_cancelled({}, { locale: 'en' });

function sectionOf(heading: HTMLElement): HTMLElement {
  const section = heading.closest('section');
  if (!section) throw new Error('heading outside a section');
  return section;
}

function blockSection(label: string): HTMLElement {
  return sectionOf(screen.getByRole('heading', { level: 3, name: label }));
}

describe('builder board: cancelled Event and cancelled block', () => {
  it('strikes a cancelled Event and badges it once, without a block badge or staffing percent', () => {
    renderBuilder();

    const title = screen.getByRole('heading', { level: 2, name: 'Retreat' });
    const event = sectionOf(title);

    expect(title).toHaveClass('line-through');
    expect(within(event).getAllByText(cancelledLabel())).toHaveLength(1);
    expect(
      screen.queryByTestId('cycle-event-staffing-percent-retreat'),
    ).toBeNull();
    const block = blockSection('Retreat block');
    expect(block).toHaveAttribute('data-cancelled', 'true');
    expect(
      within(block).getByRole('heading', { level: 3, name: 'Retreat block' }),
    ).toHaveClass('line-through');
  });

  it('badges and strikes a cancelled block of a live Event, and nothing else', () => {
    renderBuilder();

    const title = screen.getByRole('heading', { level: 2, name: 'Sunday' });
    expect(title).not.toHaveClass('line-through');
    expect(
      screen.getByTestId('cycle-event-staffing-percent-sunday'),
    ).toHaveTextContent('0%');

    const cancelled = blockSection('Cancelled block');
    expect(cancelled).toHaveAttribute('data-cancelled', 'true');
    expect(
      within(cancelled).getByRole('heading', {
        level: 3,
        name: 'Cancelled block',
      }),
    ).toHaveClass('line-through');
    expect(within(cancelled).getAllByText(cancelledLabel())).toHaveLength(1);

    const live = blockSection('Live block');
    expect(live).not.toHaveAttribute('data-cancelled');
    expect(
      within(live).getByRole('heading', { level: 3, name: 'Live block' }),
    ).not.toHaveClass('line-through');
    expect(within(live).queryByText(cancelledLabel())).toBeNull();
  });
});
