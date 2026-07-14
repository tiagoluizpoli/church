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
import type { TailoringCycleSummary } from './cycle-list.utils';
import { MinistryCycleList } from './ministry-cycle-list';
import { routeTree } from '@/routeTree.gen';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

/** `MinistryCycleList` renders a real `<Link>` (Builder Events, once
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
      <TimezoneProvider initialChurchTimezone="UTC">{ui}</TimezoneProvider>
    </RouterContextProvider>,
  );
}

const CYCLES: TailoringCycleSummary[] = [
  {
    id: 'cycle-1',
    name: 'August',
    window: 'Aug 1 - Aug 31',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    eventCount: 4,
    slotCount: 6,
    status: 'in_progress',
    isPartOf: true,
    availabilityFiredForAll: false,
  },
  {
    id: 'cycle-2',
    name: 'September',
    window: 'Sep 1 - Sep 30',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    eventCount: 2,
    slotCount: 2,
    status: 'published',
    isPartOf: true,
    availabilityFiredForAll: true,
  },
];

describe('MinistryCycleList (US2/T014, amended Iteration 3/T066/T067/T071)', () => {
  it('renders only the cycles available to the selected ministry, wrapped in the surface-panel Card pattern', () => {
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 cycles
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
    expect(table.closest('.surface-panel')).not.toBeNull();
  });

  it('shows real Events and Slots counts per cycle, not the events total (T067)', () => {
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    const augustRow = within(table).getByRole('row', { name: /August/ });
    expect(augustRow).toHaveTextContent('4');
    expect(augustRow).toHaveTextContent('6');
  });

  it('shows the leader-facing tailoring-progress status, never PlanningCycle.state (T066)', () => {
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('In progress');
    expect(rows[2]).toHaveTextContent('Published');
    expect(table).not.toHaveTextContent('locked');
  });

  it('rows are inert — clicking a row does nothing; only the explicit Tailoring button navigates (design-critique follow-up)', async () => {
    const onSelectCycle = vi.fn();
    const user = userEvent.setup();
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={onSelectCycle}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    await user.click(within(table).getByRole('row', { name: /August/ }));
    expect(onSelectCycle).not.toHaveBeenCalled();

    await user.click(
      screen.getAllByTestId(
        'ministry-cycle-tailoring-button-cycle-1',
      )[0] as HTMLElement,
    );
    expect(onSelectCycle).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });

  it('the Card wrapping the table uses the workspace-panel-lg padding token, not shadcn default px-4/py-4 (T070/FR-036)', () => {
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={CYCLES}
        onSelectCycle={vi.fn()}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    const card = table.closest('.surface-panel');
    const panel = screen.getByTestId('ministry-cycle-list-panel');
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
        <MinistryCycleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={vi.fn()}
        />,
      );

      const table = screen.getByRole('grid', { name: 'Cycles' });
      // Default sort is by window ascending: August (cycle-1) then September (cycle-2).
      expect(
        within(table)
          .getAllByTestId(/^ministry-cycle-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['ministry-cycle-row-cycle-1', 'ministry-cycle-row-cycle-2']);

      // cycle-1 has 4 events, cycle-2 has 2 — sorting by Events ascending
      // should put cycle-2 first.
      await user.click(
        within(table).getByRole('columnheader', { name: 'Events' }),
      );
      expect(
        within(table)
          .getAllByTestId(/^ministry-cycle-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['ministry-cycle-row-cycle-2', 'ministry-cycle-row-cycle-1']);

      await user.click(
        within(table).getByRole('columnheader', { name: 'Events' }),
      );
      expect(
        within(table)
          .getAllByTestId(/^ministry-cycle-row-/)
          .map((row) => row.dataset.testid),
      ).toEqual(['ministry-cycle-row-cycle-1', 'ministry-cycle-row-cycle-2']);
    });
  });

  describe('row actions (T071/FR-035)', () => {
    it("the Tailoring button is always enabled and navigates to that row's cycle", async () => {
      const onSelectCycle = vi.fn();
      const user = userEvent.setup();
      renderCycleList(
        <MinistryCycleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={onSelectCycle}
        />,
      );

      // Both the desktop table row and the mobile card render for the same
      // cycle in jsdom (no real viewport layout, per this repo's existing
      // cycle-list-card test convention) — assert against the table's copy.
      const buttons = screen.getAllByTestId(
        'ministry-cycle-tailoring-button-cycle-1',
      );
      for (const button of buttons) {
        expect(button).toBeEnabled();
      }
      await user.click(buttons[0] as HTMLElement);

      expect(onSelectCycle).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
    });

    it('the Builder Events control is disabled when availabilityFiredForAll is false', () => {
      renderCycleList(
        <MinistryCycleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={vi.fn()}
        />,
      );

      const buttons = screen.getAllByTestId(
        'ministry-cycle-builder-events-button-cycle-1',
      );
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
      expect(
        screen.queryByTestId('ministry-cycle-builder-events-link-cycle-1'),
      ).not.toBeInTheDocument();

      // Compact by design (design-critique follow-up): the explanation
      // lives in `title`/`aria-label`, not a persistent visible line, so
      // the row doesn't grow to fit copy every leader hits repeatedly.
      for (const button of buttons) {
        expect(button).toHaveAccessibleName(
          expect.stringContaining(
            'Unlocks once every event confirms availability',
          ),
        );
      }
    });

    it('the Builder Events control is disabled for a cycle the ministry is not part of, never vacuously enabled from a zero-participation check (FR-035)', () => {
      const notPartOfCycle: TailoringCycleSummary = {
        id: 'cycle-3',
        name: 'October',
        window: 'Oct 1 - Oct 31',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        eventCount: 0,
        slotCount: 0,
        status: 'not_started',
        isPartOf: false,
        availabilityFiredForAll: false,
      };
      renderCycleList(
        <MinistryCycleList
          ministryId="ministry-1"
          cycles={[...CYCLES, notPartOfCycle]}
          onSelectCycle={vi.fn()}
        />,
      );

      const buttons = screen.getAllByTestId(
        'ministry-cycle-builder-events-button-cycle-3',
      );
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
      expect(
        screen.queryByTestId('ministry-cycle-builder-events-link-cycle-3'),
      ).not.toBeInTheDocument();
    });

    it('the Builder Events control is an enabled, ministry-scoped link when availabilityFiredForAll is true, and does not also trigger row selection', async () => {
      const onSelectCycle = vi.fn();
      const user = userEvent.setup();
      renderCycleList(
        <MinistryCycleList
          ministryId="ministry-1"
          cycles={CYCLES}
          onSelectCycle={onSelectCycle}
        />,
      );

      const links = screen.getAllByTestId(
        'ministry-cycle-builder-events-link-cycle-2',
      );
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute(
          'href',
          expect.stringContaining('/scheduling/builder-events'),
        );
        expect(link).toHaveAttribute(
          'href',
          expect.stringContaining('ministryId=ministry-1'),
        );
      }

      await user.click(links[0] as HTMLElement);
      expect(onSelectCycle).not.toHaveBeenCalled();
    });
  });
});

describe('MinistryCycleList empty state (US2/T015)', () => {
  it('renders an empty-state message when the ministry has zero open cycles', () => {
    renderCycleList(
      <MinistryCycleList
        ministryId="ministry-1"
        cycles={[]}
        onSelectCycle={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('ministry-cycle-list-empty-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
