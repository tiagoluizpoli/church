import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from './cycle-list-card';
import { PlanningAdminProvider } from './planning-admin-context';
import { PlanningCycleHeader } from './planning-cycle-header';
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

function render() {
  return renderWithProviders(
    <PlanningAdminProvider>
      <PlanningCycleHeader />
      <CycleListCard />
    </PlanningAdminProvider>,
  );
}

describe('PlanningCycleHeader (T058)', () => {
  it('renders nothing when no cycle is selected', () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    render();

    expect(
      screen.queryByTestId('planning-cycle-name-status-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-cycle-period-chip'),
    ).not.toBeInTheDocument();
  });

  it('renders the name+status chip and the period chip as two separate elements', async () => {
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
    getPlanningCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'locked',
      },
      events: [],
    });

    const user = userEvent.setup();
    render();

    await user.click(await screen.findByTestId('planning-cycle-option'));

    const nameStatusChip = await screen.findByTestId(
      'planning-cycle-name-status-chip',
    );
    const periodChip = screen.getByTestId('planning-cycle-period-chip');

    expect(nameStatusChip).not.toBe(periodChip);
    expect(nameStatusChip).toHaveTextContent('August 2026');
    expect(screen.getByTestId('selected-cycle-state')).toHaveTextContent(
      'locked',
    );
    expect(periodChip).toHaveTextContent('2026-08-01');
    expect(periodChip).toHaveTextContent('2026-08-31');
    expect(periodChip).not.toHaveTextContent('August 2026');
  });
});
