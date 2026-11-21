import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type CycleFilters,
  CycleListCard,
} from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { routeTree } from '@/routeTree.gen';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    // The server always answers with counts and the next suggestion.
    listEventTemplates: async () => ({ templates: [] }),
    listCycles: async (...args: unknown[]) => ({
      counts: { draft: 0, sent: 0, past: 0 },
      pastMatching: 0,
      currentCycleId: null,
      next: { startDate: '2027-01-01', endDate: '2027-01-31', isDue: false },
      ...(await listCycles(...args)),
    }),
  },
}));

interface RenderListInput {
  filters?: CycleFilters;
  onFiltersChange?: (filters: CycleFilters) => void;
  queryClient?: QueryClient;
}

/** The rows' Open action is a real `<Link>`, which needs router context. */
function render({
  filters = {},
  onFiltersChange = vi.fn(),
  queryClient,
}: RenderListInput = {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient: new QueryClient() },
  });

  return renderWithProviders(
    <RouterContextProvider router={router}>
      <PlanningAdminProvider>
        <CycleListCard filters={filters} onFiltersChange={onFiltersChange} />
      </PlanningAdminProvider>
    </RouterContextProvider>,
    { queryClient },
  );
}

interface CycleInput {
  id: string;
  startDate?: string;
  state?: 'draft' | 'sent' | 'past';
}

function cycle({ id, startDate = '2026-08-01', state = 'draft' }: CycleInput) {
  return {
    id,
    name: id,
    startDate,
    endDate: startDate.replace(/-01$/, '-28'),
    state,
    eventCount: 0,
  };
}

describe('CycleListCard', () => {
  it('renders each Cycle as a row with its dates, state and an Open link', async () => {
    listCycles.mockResolvedValue({
      cycles: [{ ...cycle({ id: 'cycle-1', state: 'sent' }), name: 'Agosto' }],
    });

    render();

    const table = await screen.findByRole('grid', { name: m.cycles_title() });
    for (const name of [
      m.cycles_column_name(),
      m.cycles_column_window(),
      m.cycles_column_status(),
    ]) {
      expect(
        within(table).getByRole('columnheader', { name }),
      ).toBeInTheDocument();
    }
    const row = within(table).getByRole('row', { name: /Agosto/ });
    expect(row).toHaveTextContent('01/08/2026 – 28/08/2026');
    expect(row).toHaveTextContent(m.cycle_state_sent());
    const open = within(row).getByRole('link', {
      name: m.cycles_open_label({ name: 'Agosto' }),
    });
    expect(open).toHaveAttribute('href', '/cycles/cycle-1');
    expect(open).toHaveTextContent(m.cycles_open());
  });

  it.each([
    [{}, { period: 'current' }],
    [{ status: 'draft' }, { state: 'draft' }],
    [{ status: 'past' }, { state: 'past' }],
    [{ status: 'all' }, {}],
    [
      { search: 'Nov', from: '2026-11-01', to: '2026-11-30' },
      {
        period: 'current',
        search: 'Nov',
        from: '2026-11-01',
        to: '2026-11-30',
      },
    ],
  ] as const)('asks the server to filter %o as %o', async (filters, params) => {
    listCycles.mockResolvedValue({ cycles: [] });

    render({ filters });

    await screen.findByTestId('cycles-empty');
    expect(listCycles).toHaveBeenCalledWith(params);
  });

  it('keeps the server order', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        cycle({ id: 'older', startDate: '2026-06-01', state: 'past' }),
        cycle({ id: 'newer', startDate: '2026-07-01', state: 'past' }),
      ],
    });

    render({ filters: { status: 'past' } });

    const table = await screen.findByRole('grid');
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.getAttribute('data-testid'))
        .filter(Boolean),
    ).toEqual(['cycle-row-older', 'cycle-row-newer']);
  });

  it('reports a chosen status, keeping the other filters', async () => {
    listCycles.mockResolvedValue({ cycles: [cycle({ id: 'cycle-1' })] });
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render({ filters: { search: 'Nov' }, onFiltersChange });

    await user.click(
      await screen.findByRole('combobox', { name: m.cycles_filter_status() }),
    );
    await user.click(
      await screen.findByRole('option', { name: m.cycles_chip_past() }),
    );

    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: 'Nov',
      status: 'past',
    });
  });

  it('commits the typed name once typing stops', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render({ onFiltersChange });

    await user.type(
      await screen.findByRole('searchbox', { name: m.cycles_filter_search() }),
      ' Novembro ',
    );

    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenLastCalledWith({ search: 'Novembro' }),
    );
  });

  it('announces when no Cycle is current or upcoming', async () => {
    listCycles.mockResolvedValue({ cycles: [] });

    render();

    const empty = await screen.findByTestId('cycles-empty');
    expect(empty).toHaveAttribute('role', 'status');
    expect(empty).toHaveTextContent(m.cycles_empty_current());
    expect(
      screen.queryByRole('button', { name: m.cycles_clear_filters() }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('says when filters match nothing and offers to clear them beside the message', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render({ filters: { status: 'draft', search: 'x' }, onFiltersChange });

    const empty = await screen.findByTestId('cycles-empty');
    expect(empty).toHaveTextContent(m.cycles_empty_filtered());
    expect(
      screen.getAllByRole('button', { name: m.cycles_clear_filters() }),
    ).toHaveLength(1);
    await user.click(
      within(empty).getByRole('button', { name: m.cycles_clear_filters() }),
    );

    expect(onFiltersChange).toHaveBeenLastCalledWith({});
  });

  it('says when only Past Cycles match and offers them, keeping the search', async () => {
    listCycles.mockResolvedValue({ cycles: [], pastMatching: 2 });
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render({ filters: { search: 'Outubro' }, onFiltersChange });

    const empty = await screen.findByTestId('cycles-empty');
    expect(empty).toHaveTextContent(
      m.cycles_empty_past_match_other({ count: 2 }),
    );
    expect(screen.queryByTestId('cycles-past-hidden')).not.toBeInTheDocument();
    await user.click(
      within(empty).getByRole('button', { name: m.cycles_past_show() }),
    );

    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: 'Outubro',
      status: 'past',
    });
  });

  it('notes the matching Past Cycles under current results', async () => {
    listCycles.mockResolvedValue({
      cycles: [cycle({ id: 'cycle-1' })],
      pastMatching: 1,
    });

    render();

    expect(await screen.findByTestId('cycles-past-hidden')).toHaveTextContent(
      m.cycles_past_hidden_one(),
    );
  });

  it('does not mention hidden Past Cycles once a status is chosen', async () => {
    listCycles.mockResolvedValue({ cycles: [], pastMatching: 2 });

    render({ filters: { status: 'sent' } });

    await screen.findByTestId('cycles-empty');
    expect(screen.queryByTestId('cycles-past-hidden')).not.toBeInTheDocument();
  });

  it('shows how many Events each Cycle has planned', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        { ...cycle({ id: 'none' }), eventCount: 0 },
        { ...cycle({ id: 'one', startDate: '2026-09-01' }), eventCount: 1 },
        { ...cycle({ id: 'many', startDate: '2026-10-01' }), eventCount: 9 },
      ],
    });

    render();

    const table = await screen.findByRole('grid');
    expect(within(table).getByTestId('cycle-row-none')).toHaveTextContent(
      m.cycles_event_count_zero(),
    );
    expect(within(table).getByTestId('cycle-row-one')).toHaveTextContent(
      m.cycles_event_count_one(),
    );
    expect(within(table).getByTestId('cycle-row-many')).toHaveTextContent(
      m.cycles_event_count_other({ count: 9 }),
    );
  });

  it('names the month still to create and prefills New cycle with its days', async () => {
    listCycles.mockResolvedValue({
      cycles: [],
      next: { startDate: '2026-12-01', endDate: '2026-12-31', isDue: true },
    });
    const user = userEvent.setup();
    render();

    await user.click(
      await screen.findByRole('button', {
        name: m.cycles_next_create({ month: 'Dezembro 2026' }),
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: m.cycles_form_title_new(),
    });
    expect(within(dialog).getByLabelText(m.cycles_form_name())).toHaveValue(
      'Dezembro 2026',
    );
    expect(dialog).toHaveTextContent('01/12/2026');
    expect(dialog).toHaveTextContent('31/12/2026');
  });

  it('offers a plain New cycle once the coming month is already planned', async () => {
    listCycles.mockResolvedValue({
      cycles: [],
      next: { startDate: '2027-01-01', endDate: '2027-01-31', isDue: false },
    });

    render();

    await screen.findByTestId('cycles-empty');
    expect(
      screen.getByTestId('open-create-cycle-dialog-button'),
    ).toHaveTextContent(m.cycles_new());
  });

  it('marks the Cycle running today beside its state', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        { ...cycle({ id: 'next', startDate: '2026-12-01' }), state: 'sent' },
        { ...cycle({ id: 'now', startDate: '2026-11-01' }), state: 'sent' },
      ],
      currentCycleId: 'now',
    });

    render();

    const table = await screen.findByRole('grid');
    expect(within(table).getByTestId('cycle-row-now')).toHaveTextContent(
      m.cycles_running(),
    );
    expect(within(table).getByTestId('cycle-row-next')).not.toHaveTextContent(
      m.cycles_running(),
    );
  });

  it('clears every filter while results show', async () => {
    listCycles.mockResolvedValue({ cycles: [cycle({ id: 'cycle-1' })] });
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render({ filters: { status: 'all', from: '2026-08-01' }, onFiltersChange });

    await screen.findByRole('grid');
    await user.click(
      screen.getByRole('button', { name: m.cycles_clear_filters() }),
    );

    expect(onFiltersChange).toHaveBeenLastCalledWith({});
  });

  it('marks a Draft with the needs-attention badge', async () => {
    listCycles.mockResolvedValue({ cycles: [cycle({ id: 'cycle-1' })] });

    render();

    const table = await screen.findByRole('grid');
    expect(within(table).getByText(m.cycle_state_draft())).toHaveClass(
      'text-amber-700',
    );
  });

  it('opens New cycle from its action under the filter', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    const user = userEvent.setup();
    render();

    await user.click(
      await screen.findByTestId('open-create-cycle-dialog-button'),
    );

    expect(
      await screen.findByRole('dialog', { name: m.cycles_form_title_new() }),
    ).toBeVisible();
  });

  it('puts the 44px Open action inside each mobile card', async () => {
    listCycles.mockResolvedValue({ cycles: [cycle({ id: 'cycle-1' })] });

    render();

    const list = await screen.findByTestId('data-table-mobile-list');
    const card = within(list).getByTestId('cycle-option');
    const open = within(card).getByRole('link', {
      name: m.cycles_open_label({ name: 'cycle-1' }),
    });
    expect(open).toHaveClass('min-h-11');
  });

  it('shows a loading state while the list is being read', async () => {
    listCycles.mockReturnValue(new Promise(() => undefined));

    render();

    const loading = await screen.findByRole('status', {
      name: m.cycles_loading(),
    });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
    expect(screen.queryByTestId('cycles-empty')).not.toBeInTheDocument();
  });

  it('keeps the rows on screen while a refetch is in flight', async () => {
    listCycles.mockResolvedValue({
      cycles: [{ ...cycle({ id: 'cycle-1' }), name: 'Agosto' }],
    });
    const queryClient = new QueryClient();
    render({ queryClient });
    expect(
      await screen.findByRole('row', { name: /Agosto/ }),
    ).toBeInTheDocument();
    listCycles.mockClear();
    listCycles.mockReturnValue(new Promise(() => undefined));

    act(() => {
      void queryClient.invalidateQueries();
    });

    await waitFor(() => expect(listCycles).toHaveBeenCalled());
    expect(screen.getByRole('row', { name: /Agosto/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: m.cycles_loading() }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error, never the empty state, when the read fails', async () => {
    // Only the list's own filtered read fails, once; the header's read succeeds.
    let failed = false;
    listCycles.mockImplementation(async (params?: object) => {
      if (params && !failed) {
        failed = true;
        throw new Error('boom');
      }
      return { cycles: [cycle({ id: 'cycle-1' })] };
    });
    const user = userEvent.setup();
    render();

    const alert = await screen.findByTestId('cycles-load-error');
    expect(alert).toHaveTextContent(m.cycles_load_failed());
    expect(screen.queryByTestId('cycles-empty')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button'));

    expect(
      (await screen.findAllByTestId('cycle-row-cycle-1')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('cycles-load-error')).not.toBeInTheDocument();
  });
});
