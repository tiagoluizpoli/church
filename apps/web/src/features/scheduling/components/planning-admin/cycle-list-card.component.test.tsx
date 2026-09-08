import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from './cycle-list-card';
import { PlanningAdminProvider } from './planning-admin-context';
import { renderWithProviders } from '@/__tests__/setup/render';

const listPlanningCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getPlanningCycle = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
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
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'locked',
        },
      ],
    });
    getPlanningCycle.mockResolvedValue(undefined);

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
    expect(row).toHaveTextContent('2026-08-01');
    expect(row).toHaveTextContent('2026-08-31');
    expect(row).toHaveTextContent('locked');
  });

  it('selects the cycle when a table row is clicked', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue({
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

    expect(getPlanningCycle).toHaveBeenCalled();
  });

  it('keeps a single selection across clicks and keyboard navigation', async () => {
    listPlanningCycles.mockResolvedValue({
      cycles: ['cycle-1', 'cycle-2'].map((id) => ({
        id,
        name: id,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
      })),
    });
    getPlanningCycle.mockResolvedValue(undefined);
    const onSelectCycle = vi.fn();
    const user = userEvent.setup();
    render(onSelectCycle);

    const first = await screen.findByTestId('planning-cycle-row-cycle-1');
    const second = screen.getByTestId('planning-cycle-row-cycle-2');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'false');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('data-selected', 'true');
    expect(first).not.toHaveClass('bg-accent/45');
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-1' });
    expect(getPlanningCycle).toHaveBeenLastCalledWith('cycle-1');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(onSelectCycle).toHaveBeenLastCalledWith({ cycleId: 'cycle-2' });
    expect(getPlanningCycle).toHaveBeenLastCalledWith('cycle-2');

    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByTestId('planning-cycle-option')[0]).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('reflects selection changes supplied by the master-detail pane', async () => {
    listPlanningCycles.mockResolvedValue({
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
    const first = await screen.findByTestId('planning-cycle-row-cycle-1');
    const second = screen.getByTestId('planning-cycle-row-cycle-2');
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
    listPlanningCycles.mockResolvedValue({ cycles: [] });
    getPlanningCycle.mockResolvedValue(undefined);

    render();

    expect(
      await screen.findByText('No cycles yet. Create the first one to begin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
