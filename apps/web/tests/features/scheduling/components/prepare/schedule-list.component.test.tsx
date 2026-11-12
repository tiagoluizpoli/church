import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PrepareCycleSummary } from '@/features/scheduling/components/prepare/cycle-list.utils';
import {
  CycleListFiltersBar,
  DEFAULT_FILTERS,
} from '@/features/scheduling/components/prepare/cycle-list-filters-bar';
import { ScheduleList } from '@/features/scheduling/components/prepare/schedule-list';
import { routeTree } from '@/routeTree.gen';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

/** `ScheduleList` renders a real `<Link>` (Assign, once
 * enabled), which needs router context to resolve `to`/`search` even
 * outside a mounted route — `renderWithProviders` alone isn't enough here,
 * unlike components whose `Link` only renders behind a condition none of
 * their tests exercise. */
function renderCycleList(ui: ReactElement) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient: new QueryClient() },
  });

  return render(
    <RouterContextProvider router={router}>
      <TimezoneProvider churchTimezone="UTC">{ui}</TimezoneProvider>
    </RouterContextProvider>,
  );
}

const CYCLES: PrepareCycleSummary[] = [
  {
    id: 'cycle-1',
    name: 'August',
    window: 'Aug 1 - Aug 31',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    eventCount: 4,
    eventTimeBlockCount: 6,
    status: 'in_progress',
    isPartOf: true,
    availabilityRequestedForAll: false,
    availabilityRequestedForAny: false,
  },
  {
    id: 'cycle-2',
    name: 'September',
    window: 'Sep 1 - Sep 30',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    eventCount: 2,
    eventTimeBlockCount: 2,
    status: 'published',
    isPartOf: true,
    availabilityRequestedForAll: true,
    availabilityRequestedForAny: true,
  },
];

describe('Cycle list filters', () => {
  it('shows translated selected labels before the menu is opened', () => {
    renderCycleList(
      <CycleListFiltersBar
        appliedFilters={DEFAULT_FILTERS}
        onApply={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('prepare-cycle-date-mode-filter'),
    ).toHaveTextContent(m.builder_ui_starts());
    expect(
      screen.getByTestId('prepare-cycle-involvement-filter'),
    ).toHaveTextContent(m.prepare_cycle_filter_all());
    expect(screen.getByTestId('prepare-cycle-status-filter')).toHaveTextContent(
      m.prepare_cycle_filter_all(),
    );
  });
});

describe('ScheduleList (US2/T014, amended Iteration 3/T066/T067/T071)', () => {
  it('renders only the cycles available to the selected ministry, wrapped in the surface-panel Card pattern', () => {
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: m.nav_cycles() });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 cycles
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
    expect(table.closest('.surface-panel')).not.toBeNull();
  });

  it('shows real Events and Time blocks counts per cycle, not the events total (T067)', () => {
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: m.nav_cycles() });
    const augustRow = within(table).getByRole('row', { name: /August/ });
    expect(augustRow).toHaveTextContent('4');
    expect(augustRow).toHaveTextContent('6');
  });

  it('shows the leader-facing prepare-progress status, never Cycle.state (T066)', () => {
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: m.nav_cycles() });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(m.prepare_cycle_status_in_progress());
    expect(rows[2]).toHaveTextContent(m.schedules_published());
    expect(table).not.toHaveTextContent('sent');
  });

  it('rows are inert — clicking a row does nothing; only the explicit Prepare button navigates (design-critique follow-up)', async () => {
    const onSelectCycle = vi.fn();
    const user = userEvent.setup();
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={onSelectCycle}
      />,
    );

    const table = screen.getByRole('grid', { name: m.nav_cycles() });
    await user.click(within(table).getByRole('row', { name: /August/ }));
    expect(onSelectCycle).not.toHaveBeenCalled();

    await user.click(
      screen.getAllByTestId(
        'schedule-prepare-button-cycle-1',
      )[0] as HTMLElement,
    );
    expect(onSelectCycle).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });

  it('the Card wrapping the table uses the workspace-panel-lg padding token, not shadcn default px-4/py-4 (T070/FR-036)', () => {
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: m.nav_cycles() });
    const card = table.closest('.surface-panel');
    const panel = screen.getByTestId('schedule-list-panel');
    expect(card).toHaveClass('py-0');
    expect(panel).toHaveClass('workspace-panel-lg');
    // Regression guard: pairing a `px-*` utility with `workspace-panel-lg`
    // on the same element silently zeroes the token's horizontal padding —
    // Tailwind's `@layer utilities` always beats the token's `@layer
    // components` padding shorthand regardless of source order. jsdom
    // doesn't resolve real CSS cascade layers, so this can only be guarded
    // at the className level: no `px-*` utility may share this element
    // with `workspace-panel-lg` at all.
    expect(panel.className).not.toMatch(/\bpx-\d/);
  });

  describe('column sorting (design-critique follow-up, Alex/power-user red flag)', () => {
    it('sorts rows by a clicked column, ascending then descending on a second click', async () => {
      const user = userEvent.setup();
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={vi.fn()}
        />,
      );

      const table = screen.getByRole('grid', { name: m.nav_cycles() });
      // Default sort is by window ascending: August (cycle-1) then September (cycle-2).
      expect(
        within(table)
          .getAllByTestId(/^schedule-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['schedule-row-cycle-1', 'schedule-row-cycle-2']);

      // cycle-1 has 4 events, cycle-2 has 2 — sorting by Events ascending
      // should put cycle-2 first.
      await user.click(
        within(table).getByRole('columnheader', {
          name: m.cycle_header_events(),
        }),
      );
      expect(
        within(table)
          .getAllByTestId(/^schedule-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['schedule-row-cycle-2', 'schedule-row-cycle-1']);

      await user.click(
        within(table).getByRole('columnheader', {
          name: m.cycle_header_events(),
        }),
      );
      expect(
        within(table)
          .getAllByTestId(/^schedule-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['schedule-row-cycle-1', 'schedule-row-cycle-2']);
    });
  });

  describe('row actions (T071/FR-035)', () => {
    it("the Prepare button is always enabled and navigates to that row's cycle", async () => {
      const onSelectCycle = vi.fn();
      const user = userEvent.setup();
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={onSelectCycle}
        />,
      );

      // Both the desktop table row and the mobile card render for the same
      // cycle in jsdom (no real viewport layout, per this repo's existing
      // cycle-list-card test convention) — assert against the table's copy.
      const buttons = screen.getAllByTestId('schedule-prepare-button-cycle-1');
      for (const button of buttons) {
        expect(button).toBeEnabled();
      }
      await user.click(buttons[0] as HTMLElement);

      expect(onSelectCycle).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
    });

    it('the Assign control is disabled when availabilityRequestedForAny is false', () => {
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={vi.fn()}
        />,
      );

      const buttons = screen.getAllByTestId('schedule-assign-button-cycle-1');
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
      expect(
        screen.queryByTestId('schedule-assign-link-cycle-1'),
      ).not.toBeInTheDocument();

      // The reason is real text (not hover-only) so touch users can read it.
      const reasons = screen.getAllByTestId('schedule-assign-reason-cycle-1');
      expect(reasons).toHaveLength(2);
      for (const reason of reasons) {
        expect(reason).toHaveTextContent(m.prepare_cycle_assign_locked());
      }
      for (const button of buttons) {
        expect(button).toHaveAccessibleDescription(
          m.prepare_cycle_assign_locked(),
        );
      }
    });

    it('right-aligns the row actions', () => {
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={vi.fn()}
        />,
      );

      for (const button of screen.getAllByTestId(
        'schedule-prepare-button-cycle-1',
      )) {
        expect(button.parentElement).toHaveClass('justify-end');
      }
    });

    it('the Assign control is disabled for a cycle the ministry is not part of, never vacuously enabled from a zero-participation check (FR-035)', () => {
      const notPartOfCycle: PrepareCycleSummary = {
        id: 'cycle-3',
        name: 'October',
        window: 'Oct 1 - Oct 31',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        eventCount: 0,
        eventTimeBlockCount: 0,
        status: 'not_started',
        isPartOf: false,
        availabilityRequestedForAll: false,
        availabilityRequestedForAny: false,
      };
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={[...CYCLES, notPartOfCycle]}
          onSelectCycle={vi.fn()}
        />,
      );

      const buttons = screen.getAllByTestId('schedule-assign-button-cycle-3');
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
      expect(
        screen.queryByTestId('schedule-assign-link-cycle-3'),
      ).not.toBeInTheDocument();
    });

    it('the Assign control is an enabled, cycle-scoped link when availabilityRequestedForAny is true, and does not also trigger row selection', async () => {
      const onSelectCycle = vi.fn();
      const user = userEvent.setup();
      renderCycleList(
        <ScheduleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={onSelectCycle}
        />,
      );

      const links = screen.getAllByTestId('schedule-assign-link-cycle-2');
      expect(links).toHaveLength(2);
      const assignLabel = m.prepare_cycle_action_assign();
      for (const link of links) {
        expect(link).toHaveAttribute(
          'href',
          expect.stringContaining('/schedules/ministry-1/cycle-2/assign'),
        );
        expect(link).toHaveTextContent(assignLabel);
      }

      await user.click(links[0] as HTMLElement);
      expect(onSelectCycle).not.toHaveBeenCalled();
    });
  });
});

describe('ScheduleList empty state (US2/T015)', () => {
  it('renders an empty-state message when the ministry has zero open cycles', () => {
    renderCycleList(
      <ScheduleList
        ministryId="ministry-1"
        cycles={[]}
        onSelectCycle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('schedule-list-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
