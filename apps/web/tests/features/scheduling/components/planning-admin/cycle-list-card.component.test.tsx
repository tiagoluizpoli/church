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

function render(onSelectCycle = vi.fn()) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard onSelectCycle={onSelectCycle} />
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
      within(table).getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Window' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();

    const row = within(table).getByRole('row', { name: /August 2026/ });
    expect(row).toHaveTextContent('01/08/2026');
    expect(row).toHaveTextContent('31/08/2026');
    expect(row).toHaveTextContent('sent');
  });

  it('selects the cycle when a table row is clicked', async () => {
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
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
      },
      events: [],
    });

    const user = userEvent.setup();
    render();

    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /August 2026/ });

    await user.click(row);

    expect(getCycle).toHaveBeenCalled();
  });

  it('keeps a single selection across clicks and keyboard navigation', async () => {
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
    const second = within(table).getByTestId('cycle-row-cycle-2');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'false');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('data-selected', 'true');
    expect(first).not.toHaveClass('bg-accent/45');
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-1' });
    expect(getCycle).toHaveBeenLastCalledWith('cycle-1');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-2' });
    expect(getCycle).toHaveBeenLastCalledWith('cycle-2');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByTestId('cycle-option')[0]).toHaveAttribute(
      'aria-selected',
      'true',
    );
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
    const first = within(table).getByTestId('cycle-row-cycle-1');
    const second = within(table).getByTestId('cycle-row-cycle-2');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-selected', 'false');

    view.rerender(
      <PlanningAdminProvider>
        <CycleListCard selectedCycleId="cycle-2" />
      </PlanningAdminProvider>,
    );
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the empty-state message instead of an empty table when there are no cycles', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    getCycle.mockResolvedValue(undefined);

    render();

    expect(
      await screen.findByText('No cycles yet. Create the first one to begin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
