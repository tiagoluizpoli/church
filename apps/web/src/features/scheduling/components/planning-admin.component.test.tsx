import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanningAdmin } from './planning-admin';
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

vi.mock('./scheduling-nav', () => ({
  SchedulingNav: () => <nav data-testid="scheduling-nav" />,
}));

function render() {
  return renderWithProviders(<PlanningAdmin />);
}

describe('PlanningAdmin step-sequence gating (T038)', () => {
  it('shows only CreateCycleCard when there are no cycles yet', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    render();

    expect(
      await screen.findByText('Cycles are church-wide and cannot overlap.'),
    ).toBeVisible();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();
    expect(screen.queryByText('Existing cycles')).not.toBeInTheDocument();
  });

  it('shows template/review steps with CycleListCard demoted to a secondary panel once a cycle is selected', async () => {
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

    render();

    const reviewHeading = await screen.findByText('Selected cycle review');
    expect(screen.getByText('Event templates')).toBeVisible();
    expect(await screen.findByText('Apply templates and review')).toBeVisible();
    const cycleListHeading = screen.getByText('Existing cycles');

    expect(reviewHeading.compareDocumentPosition(cycleListHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('is read-only when the selected cycle is locked: no editable template/create controls', async () => {
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

    render();

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      'locked',
    );
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add manual event/i }),
    ).not.toBeInTheDocument();
  });
});
