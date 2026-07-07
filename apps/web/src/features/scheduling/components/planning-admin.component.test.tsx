import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('defaults to the cycle list view when there are no cycles yet', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    render();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create cycle' })).toBeVisible();
  });

  it('keeps cycles as the entry view, then opens review only after a cycle is selected', async () => {
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

    expect(await screen.findByText('Existing cycles')).toBeVisible();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();

    await user.click(await screen.findByTestId('planning-cycle-option'));

    expect(await screen.findByText('Selected cycle review')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Apply template' }),
    ).toBeVisible();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
  });

  it('is read-only when the selected cycle is locked: no apply/manual-event controls', async () => {
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

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      'locked',
    );
    expect(
      screen.queryByRole('button', { name: 'Apply template' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add manual event/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the template library as a saved-list view and opens creation in a dialog', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();

    render();

    await screen.findByText('Existing cycles');
    await user.click(screen.getByTestId('open-template-library-button'));

    expect(await screen.findByText('Saved templates')).toBeVisible();
    expect(screen.queryByTestId('template-name-input')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('open-create-template-dialog-button'));

    expect(
      await screen.findByRole('dialog', { name: 'Create template' }),
    ).toBeVisible();
    expect(screen.getByTestId('template-name-input')).toBeVisible();
  });

  it('opens a saved template in edit mode from the library list', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          weekday: 0,
          blocks: [
            {
              id: 'block-1',
              label: 'Welcome',
              startTime: '09:00',
              endTime: '09:30',
              order: 0,
            },
          ],
        },
      ],
    });

    const user = userEvent.setup();

    render();

    await screen.findByText('Existing cycles');
    await user.click(screen.getByTestId('open-template-library-button'));
    await user.click(
      await screen.findByTestId('open-edit-template-dialog-button'),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Edit template' }),
    ).toBeVisible();
    expect(screen.getByTestId('template-name-input')).toHaveValue(
      'Sunday Service',
    );
  });
});
