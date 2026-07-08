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

function render() {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard />
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
