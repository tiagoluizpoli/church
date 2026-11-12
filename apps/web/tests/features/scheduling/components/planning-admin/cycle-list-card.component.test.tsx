import { m } from '@church/i18n/messages';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getCycle = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
  },
}));

function render(onSelectCycle = vi.fn(), onNewCycle = vi.fn()) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard onSelectCycle={onSelectCycle} onNewCycle={onNewCycle} />
    </PlanningAdminProvider>,
  );
}

describe('CycleListCard table view (US1)', () => {
  it('renders cycles as table rows with name/window/status columns', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'sent',
        },
      ],
    });
    getCycle.mockResolvedValue(undefined);

    render();

    const table = await screen.findByRole('grid');
    expect(
      within(table).getByRole('columnheader', { name: m.cycles_column_name() }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', {
        name: m.cycles_column_window(),
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', {
        name: m.cycles_column_status(),
      }),
    ).toBeInTheDocument();

    const row = within(table).getByRole('row', { name: /August 2026/ });
    expect(row).toHaveTextContent('01/08/2026');
    expect(row).toHaveTextContent('31/08/2026');
    expect(row).toHaveTextContent(m.cycles_state_sent());
  });

  it('selects a cycle only through its explicit Select control and announces it', async () => {
    listCycles.mockResolvedValue({
      cycles: ['cycle-1', 'cycle-2'].map((id) => ({
        id,
        name: id,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
      })),
    });
    getCycle.mockResolvedValue(undefined);
    const onSelectCycle = vi.fn();
    const user = userEvent.setup();
    render(onSelectCycle);

    const table = await screen.findByRole('grid');
    const first = within(table).getByTestId('cycle-row-cycle-1');

    await user.click(within(first).getByText('cycle-1'));
    expect(onSelectCycle).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();

    const select = within(first).getByRole('button', {
      name: m.cycles_select_label({ name: 'cycle-1' }),
    });
    expect(select).toHaveAttribute('aria-pressed', 'false');
    await user.click(select);
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-1' });
    expect(getCycle).toHaveBeenLastCalledWith('cycle-1');
    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(select).toHaveTextContent(m.cycles_selected());
    expect(screen.getByRole('status')).toHaveTextContent(
      m.cycles_selected_announcement({ name: 'cycle-1' }),
    );

    await user.click(
      within(table).getByRole('button', {
        name: m.cycles_select_label({ name: 'cycle-2' }),
      }),
    );
    expect(select).toHaveAttribute('aria-pressed', 'false');
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-2' });
  });

  it('keeps the mobile card inert with a 44px right-aligned Select action', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'cycle-1',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    render();

    const list = await screen.findByTestId('data-table-mobile-list');
    expect(within(list).queryByRole('option')).toBeNull();
    const select = within(list).getByRole('button', {
      name: m.cycles_select_label({ name: 'cycle-1' }),
    });
    expect(select).toHaveClass('min-h-11');
    expect(select.parentElement).toHaveClass('justify-end');
  });

  it('reflects selection changes supplied by the master-detail pane', async () => {
    listCycles.mockResolvedValue({
      cycles: ['cycle-1', 'cycle-2'].map((id) => ({
        id,
        name: id,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
      })),
    });
    const view = renderWithProviders(
      <PlanningAdminProvider>
        <CycleListCard selectedCycleId="cycle-1" />
      </PlanningAdminProvider>,
    );
    const table = await screen.findByRole('grid');
    const pressed = (id: string) =>
      within(table)
        .getByRole('button', { name: m.cycles_select_label({ name: id }) })
        .getAttribute('aria-pressed');
    expect(pressed('cycle-1')).toBe('true');
    expect(pressed('cycle-2')).toBe('false');

    view.rerender(
      <PlanningAdminProvider>
        <CycleListCard selectedCycleId="cycle-2" />
      </PlanningAdminProvider>,
    );
    expect(pressed('cycle-1')).toBe('false');
    expect(pressed('cycle-2')).toBe('true');
  });

  it('shows the empty state with New cycle instead of an empty table', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    const onNewCycle = vi.fn();
    const user = userEvent.setup();

    render(vi.fn(), onNewCycle);

    const empty = await screen.findByTestId('cycles-empty');
    expect(empty).toHaveTextContent(m.cycles_empty());
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await user.click(
      within(empty).getByRole('button', { name: m.cycles_new() }),
    );
    expect(onNewCycle).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the list is being read', async () => {
    listCycles.mockReturnValue(new Promise(() => undefined));

    render();

    expect(await screen.findByText(m.cycles_loading())).toBeInTheDocument();
    expect(screen.queryByTestId('cycles-empty')).not.toBeInTheDocument();
  });

  it('shows a retryable error, never the empty state, when the read fails', async () => {
    listCycles.mockRejectedValueOnce(new Error('boom'));
    listCycles.mockResolvedValueOnce({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
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

  it('lists newest start first and keeps Past collapsed until expanded', async () => {
    const cycle = (
      id: string,
      startDate: string,
      state: 'draft' | 'sent' | 'past',
    ) => ({ id, name: id, startDate, endDate: startDate, state });
    listCycles.mockResolvedValue({
      cycles: [
        cycle('older-past', '2026-06-01', 'past'),
        cycle('sent', '2026-09-01', 'sent'),
        cycle('newest-past', '2026-07-01', 'past'),
        cycle('draft', '2026-10-01', 'draft'),
      ],
    });
    const user = userEvent.setup();
    render();

    const current = await screen.findByRole('grid', {
      name: m.cycles_current_heading(),
    });
    expect(
      within(current)
        .getAllByRole('row')
        .map((row) => row.getAttribute('data-testid'))
        .filter(Boolean),
    ).toEqual(['cycle-row-draft', 'cycle-row-sent']);
    expect(screen.queryByTestId('cycle-row-newest-past')).toBeNull();

    const toggle = screen.getByTestId('toggle-past-cycles');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent(m.cycles_past_show({ count: 2 }));

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const past = screen.getByRole('grid', { name: m.cycles_state_past() });
    expect(
      within(past)
        .getAllByRole('row')
        .map((row) => row.getAttribute('data-testid'))
        .filter(Boolean),
    ).toEqual(['cycle-row-newest-past', 'cycle-row-older-past']);
    expect(within(past).getAllByText(m.cycles_state_past())).toHaveLength(2);
  });

  it('opens New cycle from the header action', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    const onNewCycle = vi.fn();
    const user = userEvent.setup();
    render(vi.fn(), onNewCycle);

    await user.click(
      await screen.findByTestId('open-create-cycle-dialog-button'),
    );

    expect(onNewCycle).toHaveBeenCalledTimes(1);
  });
});
