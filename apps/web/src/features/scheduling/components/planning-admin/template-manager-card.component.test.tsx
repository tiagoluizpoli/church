import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningAdminProvider } from './planning-admin-context';
import { TemplateManagerCard } from './template-manager-card';
import { renderWithProviders } from '@/__tests__/setup/render';

const listPlanningCycles = vi.fn().mockResolvedValue({ cycles: [] });
const listEventTemplates = vi.fn();
const getPlanningCycle = vi.fn();
const deleteEventTemplate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
    deleteEventTemplate: (...args: unknown[]) => deleteEventTemplate(...args),
  },
}));

function render() {
  return renderWithProviders(
    <PlanningAdminProvider>
      <TemplateManagerCard onEditTemplate={() => undefined} />
    </PlanningAdminProvider>,
  );
}

describe('TemplateManagerCard table view (US1)', () => {
  it('renders templates as table rows with name/weekday/block-count columns and reachable actions', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          weekday: 0,
          blocks: [
            {
              id: 'b1',
              label: 'Worship',
              startTime: '09:00',
              endTime: '10:00',
              order: 0,
            },
            {
              id: 'b2',
              label: 'Message',
              startTime: '10:00',
              endTime: '11:00',
              order: 1,
            },
          ],
        },
      ],
    });

    render();

    const table = await screen.findByRole('grid');
    expect(
      within(table).getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Weekday' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Blocks' }),
    ).toBeInTheDocument();

    const row = within(table).getByRole('row', { name: /Sunday Service/ });
    expect(row).toHaveTextContent('Sunday');
    expect(row).toHaveTextContent('2');
    expect(
      within(row).getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('deletes a template from the table row action', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          weekday: 0,
          blocks: [],
        },
      ],
    });

    const user = userEvent.setup();
    render();

    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /Sunday Service/ });

    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    expect(deleteEventTemplate).toHaveBeenCalledWith('template-1');
  });

  it('shows the empty-state message instead of an empty table when there are no templates', async () => {
    listEventTemplates.mockResolvedValue({ templates: [] });

    render();

    expect(
      await screen.findByText(
        'No templates yet. Use the create action above to start a reusable library.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
