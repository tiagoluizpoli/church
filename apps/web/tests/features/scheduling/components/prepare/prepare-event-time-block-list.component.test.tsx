import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { expect, it } from 'vitest';
import {
  BLOCK,
  CYCLE_ID,
  EVENT,
  MINISTRY_ID,
  REQUIREMENT,
  SHIFT,
} from './preparation-block.fixtures';
import {
  PrepareEventTimeBlockList,
  type PrepareEventTimeBlockListProps,
} from '@/features/scheduling/components/prepare/prepare-event-time-block-list';
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
  // The day comes from its group row; a block past midnight names its end date.
  expect(row).toHaveTextContent('22:00 – 04/01/2027 02:00');
  expect(row).not.toHaveTextContent('03/01/2027');
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
  // The only buttons are the week and day fold toggles, in the table and the phone list.
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(4);
  for (const button of buttons)
    expect(button).toHaveAttribute('aria-expanded', 'true');
});

it('nests server-ordered Time blocks under Sunday-first weeks, then days, in the Church Timezone', () => {
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
  // Weeks sit straight under the page's h1.
  const weeks = screen.getAllByRole('heading', { level: 2 });
  expect(weeks.map((heading) => heading.textContent)).toEqual([
    `${m.cycle_review_week({ start: '10/01/2027', end: '16/01/2027' })}1`,
    `${m.cycle_review_week({ start: '03/01/2027', end: '09/01/2027' })}2`,
  ]);
  const days = screen.getAllByRole('heading', { level: 3 });
  expect(days.map((heading) => heading.textContent)).toEqual([
    'Dom. 10/011',
    'Dom. 03/011',
    'Sáb. 09/011',
  ]);
  expect(
    screen
      .getAllByRole('link')
      .filter((link) => link.id)
      .map((link) => link.id),
  ).toEqual([
    'event-time-block-later',
    `event-time-block-${BLOCK.eventTimeBlock.id}`,
    'event-time-block-saturday',
  ]);
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

it('shows server coverage during asking and marks the active compact row', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      stage="asking"
      compact
      selectedBlockId={BLOCK.eventTimeBlock.id}
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            { ...BLOCK, answerCoverage: { available: 2, needed: 5 } },
          ],
        },
      ]}
    />,
  );
  const row = screen.getByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  expect(row).toHaveAttribute('aria-current', 'page');
  expect(
    within(row).getByText(
      m.prepare_answer_coverage({ available: 2, needed: 5 }),
    ),
  ).toHaveClass('text-destructive');
});

it('keeps coverage neutral while pending answers could still fill the block', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      stage="asking"
      pendingAnswers={140}
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            { ...BLOCK, answerCoverage: { available: 3, needed: 12 } },
          ],
        },
      ]}
    />,
  );
  const row = screen.getByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  // The cycle-wide pending count is the Respostas bar's; rows show only their own coverage.
  const coverage = within(row).getByText(
    m.prepare_answer_coverage({ available: 3, needed: 12 }),
  );
  expect(coverage).toHaveClass('text-muted-foreground');
  expect(coverage).not.toHaveClass('text-destructive');
  expect(row).not.toHaveTextContent('140');
});

it('colours the shortfall once answers are closed', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      stage="asking"
      pendingAnswers={140}
      answersClosed
      events={[
        {
          ...EVENT,
          eventTimeBlocks: [
            { ...BLOCK, answerCoverage: { available: 3, needed: 12 } },
          ],
        },
      ]}
    />,
  );
  const row = screen.getByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  expect(
    within(row).getByText(
      m.prepare_answer_coverage({ available: 3, needed: 12 }),
    ),
  ).toHaveClass('text-destructive');
});

it('drops the empty Status column when no row has a status', () => {
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      stage="to_prepare"
      events={[
        { ...EVENT, generatedFromTemplate: true, eventTimeBlocks: [BLOCK] },
      ]}
    />,
  );
  expect(
    screen.queryByRole('columnheader', { name: m.prepare_table_status() }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: m.prepare_table_people() }),
  ).toBeInTheDocument();
});

it('folds fully elapsed weeks on first render and keeps the open block’s week unfolded', () => {
  const past = {
    ...BLOCK,
    eventTimeBlock: {
      ...BLOCK.eventTimeBlock,
      id: 'past',
      startTime: '2020-01-05T13:00:00.000Z',
      endTime: '2020-01-05T14:00:00.000Z',
    },
  };
  const elapsed = {
    ...BLOCK,
    eventTimeBlock: {
      ...past.eventTimeBlock,
      id: 'elapsed',
      startTime: '2020-01-12T13:00:00.000Z',
      endTime: '2020-01-12T14:00:00.000Z',
    },
  };
  renderList(
    <PrepareEventTimeBlockList
      ministryId={MINISTRY_ID}
      cycleId={CYCLE_ID}
      foldElapsedWeeks
      selectedBlockId="elapsed"
      events={[{ ...EVENT, eventTimeBlocks: [past, elapsed, BLOCK] }]}
    />,
  );
  expect(
    screen.queryByTestId('prepare-event-time-block-row-past'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByTestId('prepare-event-time-block-row-elapsed'),
  ).toBeInTheDocument();
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeInTheDocument();
});

it('unfolds every group while a filter is on and restores the browse folds when it clears', async () => {
  const user = userEvent.setup();
  const past = {
    ...BLOCK,
    eventTimeBlock: {
      ...BLOCK.eventTimeBlock,
      id: 'past',
      startTime: '2020-01-05T13:00:00.000Z',
      endTime: '2020-01-05T14:00:00.000Z',
    },
  };
  const events = [{ ...EVENT, eventTimeBlocks: [past, BLOCK] }];
  function Harness() {
    const [filtered, setFiltered] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setFiltered((value) => !value)}>
          filter
        </button>
        <PrepareEventTimeBlockList
          ministryId={MINISTRY_ID}
          cycleId={CYCLE_ID}
          foldElapsedWeeks={!filtered}
          events={filtered ? [{ ...EVENT, eventTimeBlocks: [past] }] : events}
        />
      </>
    );
  }
  renderList(<Harness />);
  const pastRow = () =>
    screen.queryByTestId('prepare-event-time-block-row-past');
  const current = () =>
    screen.queryByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    );
  expect(pastRow()).not.toBeInTheDocument();
  // The user folds the current week too while browsing.
  const currentWeek = screen
    .getAllByRole('button', { expanded: true })
    .find(
      (button) => !button.closest('[data-testid="data-table-mobile-list"]'),
    );
  // A group row is a fold control's row, never a disabled one.
  expect(currentWeek?.closest('[role="row"]')).not.toHaveAttribute(
    'aria-disabled',
  );
  await user.click(currentWeek as HTMLElement);
  expect(current()).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'filter' }));
  expect(pastRow()).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'filter' }));
  expect(pastRow()).not.toBeInTheDocument();
  expect(current()).not.toBeInTheDocument();
});

it('re-renders every row when the column set changes on the same table, folded or not', async () => {
  const user = userEvent.setup();
  const asking = [
    {
      ...EVENT,
      eventTimeBlocks: [
        { ...BLOCK, answerCoverage: { available: 2, needed: 5 } },
      ],
    },
  ];
  const plain = [
    { ...EVENT, generatedFromTemplate: true, eventTimeBlocks: [BLOCK] },
  ];
  const configurations: Partial<PrepareEventTimeBlockListProps>[] = [
    { stage: 'asking', events: asking },
    {
      stage: 'asking',
      events: asking,
      compact: true,
      selectedBlockId: BLOCK.eventTimeBlock.id,
    },
    { stage: 'to_prepare', events: plain },
    { stage: 'to_prepare', events: plain, compact: true },
    { stage: 'asking', events: asking },
  ];
  function Harness() {
    const [index, setIndex] = useState(0);
    return (
      <>
        <button type="button" onClick={() => setIndex((value) => value + 1)}>
          next
        </button>
        <PrepareEventTimeBlockList
          ministryId={MINISTRY_ID}
          cycleId={CYCLE_ID}
          events={asking}
          {...configurations[index]}
        />
      </>
    );
  }
  renderList(<Harness />);
  const table = () => screen.getByRole('grid');
  const expectedColumns = [
    [
      m.prepare_table_time(),
      m.prepare_table_event(),
      m.prepare_table_people(),
      m.prepare_table_status(),
      m.people_column_actions(),
    ],
    // Compact: the status rides with the title, so its column goes.
    [
      m.prepare_table_time(),
      m.prepare_table_event(),
      m.people_column_actions(),
    ],
    [
      m.prepare_table_time(),
      m.prepare_table_event(),
      m.prepare_table_people(),
      m.people_column_actions(),
    ],
    [
      m.prepare_table_time(),
      m.prepare_table_event(),
      m.people_column_actions(),
    ],
    [
      m.prepare_table_time(),
      m.prepare_table_event(),
      m.prepare_table_people(),
      m.prepare_table_status(),
      m.people_column_actions(),
    ],
  ];
  for (const [index, names] of expectedColumns.entries()) {
    if (index > 0)
      await user.click(screen.getByRole('button', { name: 'next' }));
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(names);
    // Every leaf row has one cell per column; group rows span them all.
    for (const row of within(table()).getAllByRole('row').slice(1)) {
      const cells = row.querySelectorAll('td, th');
      expect([1, names.length]).toContain(cells.length);
    }
    // Folding and unfolding the week keeps the table consistent.
    const [weekToggle] = within(table()).getAllByRole('button', {
      name: /^(Recolher|Collapse)/,
    });
    await user.click(weekToggle);
    expect(within(table()).getAllByRole('row')).toHaveLength(2);
    await user.click(
      within(table()).getAllByRole('button', { name: /^(Expandir|Expand)/ })[0],
    );
    expect(within(table()).getAllByRole('row')).toHaveLength(4);
  }
});
