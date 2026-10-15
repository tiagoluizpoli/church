import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListScheduleSummaries200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { renderRoute } from '@/tests/setup/render-route';

const listScheduleSummaries = vi.fn();
const listMinistries = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listScheduleSummaries: (...args: unknown[]) =>
      listScheduleSummaries(...args),
    listMinistries: (...args: unknown[]) => listMinistries(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

beforeEach(() => {
  listScheduleSummaries.mockReset();
  listMinistries.mockReset();
  listMinistries.mockResolvedValue({
    ministries: [{ id: 'ministry-1', name: 'Greeters' }],
  });
  getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

function renderScheduleList() {
  return renderRoute({
    initialPath: '/schedules/ministry-1',
    churchTimezone: 'UTC',
  });
}

function makeCycle(
  overrides: Partial<ListScheduleSummaries200CyclesItem> = {},
): ListScheduleSummaries200CyclesItem {
  return {
    cycleId: 'cycle-1',
    name: 'August',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    isPartOf: true,
    eventCount: 1,
    eventTimeBlockCount: 2,
    status: 'in_progress',
    availabilityRequestedForAll: false,
    availabilityRequestedForAny: false,
    ...overrides,
  };
}

describe('Prepare ministry cycle-list route (US2/T015a, amended Iteration 3)', () => {
  it('redirects straight to the workspace when exactly one cycle the ministry is part of is open', async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'August', isPartOf: true }),
        makeCycle({
          cycleId: 'cycle-not-part-of',
          name: 'September',
          isPartOf: false,
          eventCount: 0,
          eventTimeBlockCount: 0,
          status: 'not_started',
        }),
      ],
    });

    const { router } = renderScheduleList();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/schedules/ministry-1/cycle-1',
      ),
    );
  });

  it('shows a distinct "redirecting" message with a "Browse all cycles instead" escape hatch while the single-cycle redirect is in flight', async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [makeCycle({ cycleId: 'cycle-1', name: 'August' })],
    });

    const { router } = renderScheduleList();

    expect(
      await screen.findByTestId('prepare-cycle-list-redirecting'),
    ).toHaveTextContent('Browse all cycles instead');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/schedules/ministry-1/cycle-1',
      ),
    );
  });

  it('?browse=true skips the auto-redirect and shows the picker even with exactly one isPartOf cycle', async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [makeCycle({ cycleId: 'cycle-1', name: 'August' })],
    });

    const { router } = renderRoute({
      initialPath: '/schedules/ministry-1?browse=true',
      churchTimezone: 'UTC',
    });

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August');
    expect(router.state.location.pathname).toBe('/schedules/ministry-1');
  });

  it("renders the picker normally when 2+ isPartOf cycles are open, using each cycle's own name and real Events/Time blocks/Status columns", async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({
          cycleId: 'cycle-1',
          name: 'August',
          eventCount: 4,
          eventTimeBlockCount: 6,
          status: 'in_progress',
        }),
        makeCycle({
          cycleId: 'cycle-2',
          name: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          eventCount: 2,
          eventTimeBlockCount: 2,
          status: 'published',
        }),
      ],
    });

    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
    expect(table).toHaveTextContent('In progress');
    expect(table).toHaveTextContent('Published');
    expect(screen.getByTestId('prepare-cycle-count')).toHaveTextContent('2');
    expect(screen.getByTestId('prepare-cycle-event-total')).toHaveTextContent(
      '6',
    );
    expect(
      screen.getByTestId('prepare-cycle-event-time-block-total'),
    ).toHaveTextContent('8');
    expect(screen.getByTestId('prepare-cycle-ministry-name')).toHaveTextContent(
      'Greeters',
    );
  });

  it('navigates to the selected cycle workspace when its Schedule button is clicked (rows themselves are inert)', async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'August' }),
        makeCycle({ cycleId: 'cycle-2', name: 'September' }),
      ],
    });

    const user = userEvent.setup();
    const { router } = renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });
    await user.click(
      screen.getAllByTestId(
        'schedule-prepare-button-cycle-2',
      )[0] as HTMLElement,
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/schedules/ministry-1/cycle-2',
      ),
    );
  });
});

describe('Prepare ministry cycle-list route — filters (US2/T068/T069, Iteration 3)', () => {
  function mockThreeCycles() {
    listScheduleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({
          cycleId: 'aug-not-part-of',
          name: 'August (not part of)',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          isPartOf: false,
          eventCount: 0,
          eventTimeBlockCount: 0,
          status: 'not_started',
        }),
        makeCycle({
          cycleId: 'sep-in-progress',
          name: 'September (in progress)',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          isPartOf: true,
          eventCount: 2,
          eventTimeBlockCount: 3,
          status: 'in_progress',
        }),
        makeCycle({
          cycleId: 'oct-published',
          name: 'October (published)',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          isPartOf: true,
          eventCount: 1,
          eventTimeBlockCount: 1,
          status: 'published',
        }),
      ],
    });
  }

  it('narrows by Ministry Involvement, including "Not part of" (post-analyze finding I1), only after Apply is clicked (design-critique follow-up: draft, not live)', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    expect(table).toHaveTextContent('August (not part of)');
    expect(table).toHaveTextContent('September (in progress)');
    expect(table).toHaveTextContent('October (published)');

    const applyButton = screen.getByTestId('prepare-cycle-filters-apply');
    expect(applyButton).toBeDisabled();

    await user.click(screen.getByTestId('prepare-cycle-involvement-filter'));
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
    expect(screen.getByTestId('prepare-cycle-count')).toHaveTextContent('1');
    expect(applyButton).toBeDisabled();
  });

  it('syncs applied filters to the URL so a refresh/shared link restores them (design-critique follow-up)', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    const { router } = renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('prepare-cycle-involvement-filter'));
    await user.click(
      await screen.findByRole('option', { name: 'Not part of' }),
    );
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        involvement: 'not_part_of',
      }),
    );

    // Simulate a fresh load at that exact URL (refresh / shared link).
    listScheduleSummaries.mockClear();
    const fresh = renderRoute({
      initialPath: '/schedules/ministry-1?involvement=not_part_of',
      churchTimezone: 'UTC',
    });
    const freshTable = await screen.findAllByRole('grid', { name: 'Cycles' });
    expect(freshTable.at(-1)).toHaveTextContent('August (not part of)');
    expect(freshTable.at(-1)).not.toHaveTextContent('September (in progress)');
    fresh.unmount();
  });

  it('narrows by status once applied', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('prepare-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).toHaveTextContent('October (published)');
      expect(table).not.toHaveTextContent('September (in progress)');
    });
  });

  it('resets an individual date field via its own clear control without touching other draft fields', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    const dateStart = screen.getByTestId('prepare-cycle-date-start-filter');
    await pickCalendarDate({ user, trigger: dateStart, date: '2026-08-15' });
    expect(dateStart).not.toHaveTextContent('Pick a date');

    await user.click(
      screen.getByTestId('prepare-cycle-date-start-filter-clear'),
    );
    expect(dateStart).toHaveTextContent('Pick a date');
    // Clearing a single field is still just a draft edit — Apply reflects it.
    expect(screen.getByTestId('prepare-cycle-filters-apply')).toBeDisabled();
  });

  it("date range filter is mode-driven (Starts/Ends/Within), mirroring the prepare workspace's time-of-day filter (design-critique follow-up)", async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    // September starts 09-01; a "starts" filter for [09-15, 12-31] must
    // exclude it even though September's own END date (09-30) would match.
    const dateStart = screen.getByTestId('prepare-cycle-date-start-filter');
    const dateEnd = screen.getByTestId('prepare-cycle-date-end-filter');
    await pickCalendarDate({ user, trigger: dateStart, date: '2026-09-15' });
    await pickCalendarDate({ user, trigger: dateEnd, date: '2026-12-31' });
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).not.toHaveTextContent('September (in progress)');
      expect(table).toHaveTextContent('October (published)');
    });

    // Switching to "ends" (still with the same [09-15, 12-31] bounds) picks
    // September back up, since its end date (09-30) is inside that range.
    await user.click(screen.getByTestId('prepare-cycle-date-mode-filter'));
    await user.click(await screen.findByRole('option', { name: 'Ends' }));
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    await waitFor(() => {
      expect(table).toHaveTextContent('September (in progress)');
      expect(table).toHaveTextContent('October (published)');
    });
  });

  it('the filter toolbar sits inside the same rounded card as the table, not a separate floating block (design-critique follow-up)', async () => {
    mockThreeCycles();
    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });
    const filtersRegion = screen.getByTestId('schedule-list-filters');
    const card = table.closest('.surface-panel');

    expect(card).not.toBeNull();
    expect(filtersRegion.closest('.surface-panel')).toBe(card);
  });

  it('shows a filtered (not blank-slate) empty state and a working "Clear filters" action when a filter combination matches zero cycles', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('prepare-cycle-involvement-filter'));
    await user.click(
      await screen.findByRole('option', { name: 'Not part of' }),
    );
    await user.click(screen.getByTestId('prepare-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    const emptyState = await screen.findByTestId('schedule-list-empty-state');
    expect(emptyState).toHaveTextContent(
      'No cycles match the current filters.',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    // The filter toolbar itself stays visible and usable even when the
    // filtered result is empty (design-critique follow-up) — it lives in
    // the same card as the empty message, not a separate floating block.
    expect(screen.getByTestId('schedule-list-filters')).toBeInTheDocument();

    await user.click(screen.getByTestId('prepare-cycle-filters-clear'));

    expect(
      await screen.findByRole('grid', { name: 'Cycles' }),
    ).toHaveTextContent('August (not part of)');
  });

  it('the filter bar\'s own "Clear filters" button resets and immediately re-applies the default (empty) filter set', async () => {
    mockThreeCycles();
    const user = userEvent.setup();
    renderScheduleList();

    const table = await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('prepare-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));
    await waitFor(() => expect(table).not.toHaveTextContent('August'));

    const clearButton = screen.getByTestId('prepare-cycle-filters-clear');
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
    renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });

    await user.click(screen.getByTestId('prepare-cycle-involvement-filter'));
    await user.click(await screen.findByRole('option', { name: 'Part of' }));
    await user.click(screen.getByTestId('prepare-cycle-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Published' }));
    await user.click(screen.getByTestId('prepare-cycle-filters-apply'));

    await waitFor(() =>
      expect(screen.getByTestId('prepare-cycle-count')).toHaveTextContent('1'),
    );
    expect(screen.getByTestId('prepare-cycle-event-total')).toHaveTextContent(
      '1',
    );
    expect(
      screen.getByTestId('prepare-cycle-event-time-block-total'),
    ).toHaveTextContent('1');
  });
});

describe('Prepare ministry cycle-list route — batched request (US2/T072a, FR-032/SC-011)', () => {
  it('issues exactly one request for participation-derived cycle data regardless of cycle count', async () => {
    listScheduleSummaries.mockResolvedValue({
      cycles: [
        makeCycle({ cycleId: 'cycle-1', name: 'Cycle 1' }),
        makeCycle({ cycleId: 'cycle-2', name: 'Cycle 2' }),
        makeCycle({ cycleId: 'cycle-3', name: 'Cycle 3' }),
      ],
    });

    renderScheduleList();

    await screen.findByRole('grid', { name: 'Cycles' });
    expect(listScheduleSummaries).toHaveBeenCalledTimes(1);
  });
});

describe('Prepare ministry cycle-list route — permission failure (US2/T015b/T072)', () => {
  it('renders a permission-denied state on a 403, not a crash', async () => {
    listScheduleSummaries.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });

    renderScheduleList();

    expect(
      await screen.findByTestId('prepare-forbidden-state'),
    ).toBeInTheDocument();
  });
});

describe('Prepare ministry cycle-list route — network failure (US2/T015c/T072)', () => {
  it('renders a retryable error state, not a crash or infinite spinner', async () => {
    listScheduleSummaries.mockRejectedValue({
      isAxiosError: true,
      message: 'Network Error',
    });

    renderScheduleList();

    expect(
      await screen.findByTestId('prepare-retryable-error-state'),
    ).toBeInTheDocument();
  });
});
