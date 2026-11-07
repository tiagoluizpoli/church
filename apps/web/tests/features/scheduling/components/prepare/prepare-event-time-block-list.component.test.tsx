import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, it } from 'vitest';
import {
  BLOCK,
  CYCLE_ID,
  EVENT,
  MINISTRY_ID,
  REQUIREMENT,
  SHIFT,
} from './preparation-block.fixtures';
import { PrepareEventTimeBlockList } from '@/features/scheduling/components/prepare/prepare-event-time-block-list';
import { routeTree } from '@/routeTree.gen';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

function renderList(ui: ReactElement) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient: new QueryClient() },
  });
  return render(
    <RouterContextProvider router={router}>
      <TimezoneProvider churchTimezone="America/Sao_Paulo">
        {ui}
      </TimezoneProvider>
    </RouterContextProvider>,
  );
}

it('summarizes people needed across Shifts and requirements, tags one-off Events and notes uncovered answers', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            {
              ...BLOCK,
              shiftsChangedAfterAsk: true,
              shifts: [
                SHIFT,
                {
                  ...SHIFT,
                  id: 'second-shift',
                  requirements: [
                    {
                      ...REQUIREMENT,
                      id: 'second-requirement',
                      peopleNeeded: 7,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]}
    />,
  );
  const row = screen.getByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  expect(row).toHaveTextContent(
    m.prepare_row_summary({
      shifts: m.usual_setup_shift_count_other({ count: 2 }),
      people: m.prepare_people_count_other({ count: 9 }),
    }),
  );
  expect(within(row).getByText(m.prepare_one_off())).toBeVisible();
  expect(
    within(row).getByText(m.prepare_answers_coverage_note()),
  ).toBeVisible();
  expect(row).toHaveTextContent('03/01/2027 22:00 – 04/01/2027 02:00');
});

it('distinguishes Not served and flagged Shifts without rendering preparation controls', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      events={[
        {
          ...EVENT,
          generatedFromTemplate: true,
          eventTimeBlocks: [
            {
              ...BLOCK,
              included: false,
              shifts: [],
              eventTimeBlock: { ...BLOCK.eventTimeBlock, id: 'not-served' },
            },
            {
              ...BLOCK,
              shifts: [
                SHIFT,
                { ...SHIFT, id: 'flagged', requirements: [], flagged: true },
              ],
            },
          ],
        },
      ]}
    />,
  );
  expect(
    screen.getByTestId('prepare-event-time-block-row-not-served'),
  ).toHaveTextContent(m.prepare_not_served());
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toHaveTextContent(m.prepare_needs_headcount());
  expect(screen.queryByText(m.prepare_one_off())).not.toBeInTheDocument();
  expect(
    screen.queryByText(m.prepare_answers_coverage_note()),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('groups chronological Time blocks into Sunday-first weeks in the Church Timezone', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            {
              ...BLOCK,
              eventTimeBlock: {
                ...BLOCK.eventTimeBlock,
                id: 'later',
                startTime: '2027-01-10T04:00:00.000Z',
                endTime: '2027-01-10T05:00:00.000Z',
              },
            },
            BLOCK,
            {
              ...BLOCK,
              eventTimeBlock: {
                ...BLOCK.eventTimeBlock,
                id: 'saturday',
                startTime: '2027-01-10T01:00:00.000Z',
                endTime: '2027-01-10T02:00:00.000Z',
              },
            },
          ],
        },
      ]}
    />,
  );
  const firstWeek = screen.getByRole('region', {
    name: m.cycle_review_week({ start: '03/01/2027', end: '09/01/2027' }),
  });
  const nextWeek = screen.getByRole('region', {
    name: m.cycle_review_week({ start: '10/01/2027', end: '16/01/2027' }),
  });
  expect(
    within(firstWeek)
      .getAllByRole('link')
      .map((link) => link.id),
  ).toEqual([
    `event-time-block-${BLOCK.eventTimeBlock.id}`,
    'event-time-block-saturday',
  ]);
  expect(
    within(nextWeek)
      .getAllByRole('link')
      .map((link) => link.id),
  ).toEqual(['event-time-block-later']);
});

it('uses singular Shift and person summaries', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            {
              ...BLOCK,
              shifts: [
                {
                  ...SHIFT,
                  requirements: [{ ...REQUIREMENT, peopleNeeded: 1 }],
                },
              ],
            },
          ],
        },
      ]}
    />,
  );
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toHaveTextContent(
    m.prepare_row_summary({
      shifts: m.usual_setup_shift_count_one(),
      people: m.prepare_people_count_one(),
    }),
  );
});
