import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: { templateId: string };
    className?: string;
    'data-testid'?: string;
  }) => (
    <a
      href={to.replace('$templateId', params?.templateId ?? '')}
      className={props.className}
      data-testid={props['data-testid']}
    >
      {children}
    </a>
  ),
}));

import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { TemplateManagerCard } from '@/features/scheduling/components/planning-admin/template-manager-card';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn().mockResolvedValue({ cycles: [] });
const listEventTemplates = vi.fn();
const getCycle = vi.fn();
const deleteEventTemplate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
    deleteEventTemplate: (...args: unknown[]) => deleteEventTemplate(...args),
  },
}));

function render() {
  return renderWithProviders(
    <PlanningAdminProvider>
      <TemplateManagerCard />
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
      within(table).getByRole('columnheader', { name: 'Nome' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Dia da semana' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Blocos' }),
    ).toBeInTheDocument();

    const row = within(table).getByRole('row', { name: /Sunday Service/ });
    expect(row).toHaveTextContent('Domingo');
    expect(row).toHaveTextContent('2');
    expect(within(row).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/event-templates/template-1',
    );
    expect(
      within(row).getByRole('button', { name: 'Excluir' }),
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

    await user.click(within(row).getByRole('button', { name: 'Excluir' }));

    expect(deleteEventTemplate).toHaveBeenCalledWith('template-1');
  });

  it('renders the Delete action with destructive styling, distinct from Edit', async () => {
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

    render();

    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /Sunday Service/ });

    expect(within(row).getByRole('button', { name: 'Excluir' })).toHaveClass(
      'text-destructive',
    );
    expect(within(row).getByRole('link', { name: 'Editar' })).not.toHaveClass(
      'text-destructive',
    );
  });

  it('renders the mobile card with the same name, description, and reachable actions as the table row', async () => {
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
          ],
        },
      ],
    });

    render();

    const mobileRow = await screen.findByTestId('saved-template-row');
    expect(mobileRow).toHaveTextContent('Sunday Service');
    expect(
      within(mobileRow).getByTestId('edit-template-button'),
    ).toBeInTheDocument();
    expect(
      within(mobileRow).getByTestId('delete-template-button'),
    ).toBeInTheDocument();
  });

  it('deletes a template from the mobile card action', async () => {
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

    const mobileRow = await screen.findByTestId('saved-template-row');
    await user.click(within(mobileRow).getByTestId('delete-template-button'));

    expect(deleteEventTemplate).toHaveBeenCalledWith('template-1');
  });

  it('shows the empty state with a New template action instead of an empty table', async () => {
    listEventTemplates.mockResolvedValue({ templates: [] });

    render();

    expect(
      await screen.findByText(
        'Nenhum modelo de evento ainda. Crie seu primeiro encontro reutilizável.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Novo modelo' })).toHaveAttribute(
      'href',
      '/event-templates/new',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('shows a load failure with retry that refetches the list', async () => {
    listEventTemplates.mockRejectedValueOnce(new Error('boom'));
    listEventTemplates.mockResolvedValueOnce({
      templates: [
        { id: 'template-1', name: 'Sunday Service', weekday: 0, blocks: [] },
      ],
    });
    const user = userEvent.setup();

    render();

    const alert = await screen.findByTestId('templates-load-error');
    expect(alert).toHaveTextContent(
      'Não foi possível carregar os modelos de evento.',
    );
    await user.click(
      within(alert).getByRole('button', { name: 'Tentar novamente' }),
    );

    expect(
      await screen.findByRole('row', { name: /Sunday Service/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('templates-load-error'),
    ).not.toBeInTheDocument();
  });
});
