import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';
import { renderRoute } from '@/__tests__/setup/render-route';
import type { ListMinistryCycleSummaries200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';

const listMinistryCycleSummaries = vi.fn();
const listMinistries = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistryCycleSummaries: (...args: unknown[]) =>
      listMinistryCycleSummaries(...args),
    listMinistries: (...args: unknown[]) => listMinistries(...args),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

beforeEach(() => {
  listMinistryCycleSummaries.mockReset();
  listMinistries.mockReset();
  listMinistries.mockResolvedValue({
    ministries: [{ id: 'ministry-1', name: 'Greeters' }],
  });
  getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

function renderMinistryCycleList() {
  return renderRoute({ initialPath: '/scheduling/tailoring/ministry-1' });
}

function makeCycle(
  overrides: Partial<ListMinistryCycleSummaries200CyclesItem> = {},
): ListMinistryCycleSummaries200CyclesItem {
  return {
    cycleId: 'cycle-1',
    name: 'August',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    isPartOf: true,
    eventCount: 1,
    slotCount: 2,
    status: 'in_progress',
    availabilityFiredForAll: false,
    availabilityFiredForAny: false,
    ...overrides,
  };
}

describe('Tailoring ministry cycle-list route (US2/T015a, amended Iteration 3)', () => {
  it('redirects straight to the workspace when exactly one cycle the ministry is part of is open', async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'August', isPartOf: true }),
        makeCycle({
          cycleId: 'cycle-not-part-of',
          name: 'September',
          isPartOf: false,
          eventCount: 0,
          slotCount: 0,
          status: 'not_started',
        }),
      ],
    });

    const { router } = renderMinistryCycleList();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1/cycle-1',
      ),
    );
  });

  it('shows a distinct "redirecting" message with a "Browse all cycles instead" escape hatch while the single-cycle redirect is in flight', async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [makeCycle({ cycleId: 'cycle-1', name: 'August' })],
    });

    const { router } = renderMinistryCycleList();

    expect(
      await screen.findByTestId('tailoring-cycle-list-redirecting'),
    ).toHaveTextContent('Browse all cycles instead');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1/cycle-1',
      ),
    );
  });

  it('?browse=true skips the auto-redirect and shows the picker even with exactly one isPartOf cycle', async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [makeCycle({ cycleId: 'cycle-1', name: 'August' })],
    });

    const { router } = renderRoute({
      initialPath: '/scheduling/tailoring/ministry-1?browse=true',
    });

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August');
    expect(router.state.location.pathname).toBe(
      '/scheduling/tailoring/ministry-1',
    );
  });

  it("renders the picker normally when 2+ isPartOf cycles are open, using each cycle's own name and real Events/Slots/Status columns", async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({
          cycleId: 'cycle-1',
          name: 'August',
          eventCount: 4,
          slotCount: 6,
          status: 'in_progress',
        }),
        makeCycle({
          cycleId: 'cycle-2',
          name: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          eventCount: 2,
          slotCount: 2,
          status: 'published',
        }),
      ],
    });

    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
    expect(table).toHaveTextContent('In progress');
    expect(table).toHaveTextContent('Published');
    expect(screen.getByTestId('tailoring-cycle-count')).toHaveTextContent('2');
    expect(screen.getByTestId('tailoring-cycle-event-total')).toHaveTextContent(
      '6',
    );
    expect(screen.getByTestId('tailoring-cycle-slot-total')).toHaveTextContent(
      '8',
    );
    expect(
      screen.getByTestId('tailoring-cycle-ministry-name'),
    ).toHaveTextContent('Greeters');
  });

  it('navigates to the selected cycle workspace when its Roster button is clicked (rows themselves are inert)', async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'August' }),
        makeCycle({ cycleId: 'cycle-2', name: 'September' }),
      ],
    });

    const user = userEvent.setup();
    const { router } = renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });
    await user.click(
      screen.getAllByTestId(
        'ministry-cycle-tailoring-button-cycle-2',
      )[0] as HTMLElement,
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/scheduling/tailoring/ministry-1/cycle-2',
      ),
    );
  });
});

describe('Tailoring ministry cycle-list route — filters (US2/T068/T069, Iteration 3)', () => {
  function mockThreeCycles() {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({
          cycleId: 'aug-not-part-of',
          name: 'August (not part of)',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          isPartOf: false,
          eventCount: 0,
          slotCount: 0,
          status: 'not_started',
        }),
        makeCycle({
          cycleId: 'sep-in-progress',
          name: 'September (in progress)',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          isPartOf: true,
          eventCount: 2,
          slotCount: 3,
          status: 'in_progress',
        }),
        makeCycle({
          cycleId: 'oct-published',
          name: 'October (published)',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          isPartOf: true,
          eventCount: 1,
          slotCount: 1,
          status: 'published',
        }),
      ],
    });
  }

  it('narrows by Ministry Involvement, including "Not part of" (post-analyze finding I1), only after Apply is clicked (design-critique follow-up: draft, not live)', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August (not part of)');
    expect(table).toHaveTextContent('September (in progress)');
    expect(table).toHaveTextContent('October (published)');

    const applyButton = screen.getByTestId('tailoring-cycle-filters-apply');
    expect(applyButton).toBeDisabled();

    await user.click(screen.getByTestId('tailoring-cycle-involvement-filter'));
    await user.click(
      await screen.findByRole('option', { name: 'Not part of' }),
    );

    // Selecting a value only updates the draft — no request/URL change yet.
    expect(table).toHaveTextContent('September (in progress)');
    expect(applyButton).toBeEnabled();

    await user.click(applyButton);

    await waitFor(() => {
      expect(table).toHaveTextContent('August (not part of)');
      expect(table).not.toHaveTextContent('September (in progress)');
      expect(table).not.toHaveTextContent('October (published)');
    });
    expect(screen.getByTestId('tailoring-cycle-count')).toHaveTextContent('1');
    expect(applyButton).toBeDisabled();
  });

  it('syncs applied filters to the URL so a refresh/shared link restores them (design-critique follow-up)', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    const { router } = renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('tailoring-cycle-involvement-filter'));
    await user.click(
      await screen.findByRole('option', { name: 'Not part of' }),
    );
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        involvement: 'not_part_of',
      }),
    );

    // Simulate a fresh load at that exact URL (refresh / shared link).
    listMinistryCycleSummaries.mockClear();
    const fresh = renderRoute({
      initialPath: '/scheduling/tailoring/ministry-1?involvement=not_part_of',
    });
    const freshTable = await screen.findAllByRole('grid', { name: 'Cycles' });
    expect(freshTable.at(-1)).toHaveTextContent('August (not part of)');
    expect(freshTable.at(-1)).not.toHaveTextContent('September (in progress)');
    fresh.unmount();
  });

  it('narrows by status once applied', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('tailoring-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).toHaveTextContent('October (published)');
      expect(table).not.toHaveTextContent('September (in progress)');
    });
  });

  it('resets an individual date field via its own clear control without touching other draft fields', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    const dateStart = screen.getByTestId('tailoring-cycle-date-start-filter');
    await pickCalendarDate({ user, trigger: dateStart, date: '2026-08-15' });
    expect(dateStart).not.toHaveTextContent('Pick a date');

    await user.click(
      screen.getByTestId('tailoring-cycle-date-start-filter-clear'),
    );
    expect(dateStart).toHaveTextContent('Pick a date');
    // Clearing a single field is still just a draft edit — Apply reflects it.
    expect(screen.getByTestId('tailoring-cycle-filters-apply')).toBeDisabled();
  });

  it("date range filter is mode-driven (Starts/Ends/Within), mirroring the tailoring workspace's time-of-day filter (design-critique follow-up)", async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    // September starts 09-01; a "starts" filter for [09-15, 12-31] must
    // exclude it even though September's own END date (09-30) would match.
    const dateStart = screen.getByTestId('tailoring-cycle-date-start-filter');
    const dateEnd = screen.getByTestId('tailoring-cycle-date-end-filter');
    await pickCalendarDate({ user, trigger: dateStart, date: '2026-09-15' });
    await pickCalendarDate({ user, trigger: dateEnd, date: '2026-12-31' });
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).not.toHaveTextContent('September (in progress)');
      expect(table).toHaveTextContent('October (published)');
    });

    // Switching to "ends" (still with the same [09-15, 12-31] bounds) picks
    // September back up, since its end date (09-30) is inside that range.
    await user.click(screen.getByTestId('tailoring-cycle-date-mode-filter'));
    await user.click(await screen.findByRole('option', { name: 'Ends' }));
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).toHaveTextContent('September (in progress)');
      expect(table).toHaveTextContent('October (published)');
    });
  });

  it('the filter toolbar sits inside the same rounded card as the table, not a separate floating block (design-critique follow-up)', async () => {
    mockThreeCycles();
    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    const filtersSlot = screen.getByTestId('ministry-cycle-list-filters-slot');
    const card = table.closest('.surface-panel');

    expect(card).not.toBeNull();
    expect(filtersSlot.closest('.surface-panel')).toBe(card);
  });

  it('shows a filtered (not blank-slate) empty state and a working "Clear filters" action when a filter combination matches zero cycles', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('tailoring-cycle-involvement-filter'));
    await user.click(
      await screen.findByRole('option', { name: 'Not part of' }),
    );
    await user.click(screen.getByTestId('tailoring-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    const emptyState = await screen.findByTestId(
      'ministry-cycle-list-empty-state',
    );
    expect(emptyState).toHaveTextContent(
      'No cycles match the current filters.',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    // The filter toolbar itself stays visible and usable even when the
    // filtered result is empty (design-critique follow-up) — it lives in
    // the same card as the empty message, not a separate floating block.
    expect(
      screen.getByTestId('ministry-cycle-list-filters-slot'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('tailoring-cycle-filters-clear'));

    expect(
      await screen.findByRole('grid', { name: 'Cycles' }),
    ).toHaveTextContent('August (not part of)');
  });

  it('the filter bar\'s own "Clear filters" button resets and immediately re-applies the default (empty) filter set', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('tailoring-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));
    await waitFor(() => expect(table).not.toHaveTextContent('August'));

    const clearButton = screen.getByTestId('tailoring-cycle-filters-clear');
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    await waitFor(() => {
      expect(table).toHaveTextContent('August (not part of)');
      expect(table).toHaveTextContent('September (in progress)');
      expect(table).toHaveTextContent('October (published)');
    });
    expect(clearButton).toBeDisabled();
  });

  it('combines Ministry Involvement and status filters with AND semantics, and keeps header pills filter-aware', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('tailoring-cycle-involvement-filter'));
    await user.click(await screen.findByRole('option', { name: 'Part of' }));
    await user.click(screen.getByTestId('tailoring-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('tailoring-cycle-filters-apply'));

    await waitFor(() =>
      expect(screen.getByTestId('tailoring-cycle-count')).toHaveTextContent(
        '1',
      ),
    );
    expect(screen.getByTestId('tailoring-cycle-event-total')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('tailoring-cycle-slot-total')).toHaveTextContent(
      '1',
    );
  });
});

describe('Tailoring ministry cycle-list route — batched request (US2/T072a, FR-032/SC-011)', () => {
  it('issues exactly one request for participation-derived cycle data regardless of cycle count', async () => {
    listMinistryCycleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'Cycle 1' }),
        makeCycle({ cycleId: 'cycle-2', name: 'Cycle 2' }),
        makeCycle({ cycleId: 'cycle-3', name: 'Cycle 3' }),
      ],
    });

    renderMinistryCycleList();

    await screen.findByRole('grid', { name: 'Cycles' });
    expect(listMinistryCycleSummaries).toHaveBeenCalledTimes(1);
  });
});

describe('Tailoring ministry cycle-list route — permission failure (US2/T015b/T072)', () => {
  it('renders a permission-denied state on a 403, not a crash', async () => {
    listMinistryCycleSummaries.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });

    renderMinistryCycleList();

    expect(
      await screen.findByTestId('tailoring-forbidden-state'),
    ).toBeInTheDocument();
  });
});

describe('Tailoring ministry cycle-list route — network failure (US2/T015c/T072)', () => {
  it('renders a retryable error state, not a crash or infinite spinner', async () => {
    listMinistryCycleSummaries.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });

    renderMinistryCycleList();

    expect(
      await screen.findByTestId('tailoring-retryable-error-state'),
    ).toBeInTheDocument();
  });
});
