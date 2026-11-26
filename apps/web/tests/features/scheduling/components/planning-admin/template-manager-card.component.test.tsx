import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

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
    'aria-label'?: string;
  }) => (
    <a
      href={to.replace('$templateId', params?.templateId ?? '')}
      className={props.className}
      data-testid={props['data-testid']}
      aria-label={props['aria-label']}
    >
      {children}
    </a>
  ),
}));

import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { TemplateManagerCard } from '@/features/scheduling/components/planning-admin/template-manager-card';
import { startHangingRefetch } from '@/tests/setup/refetch';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn().mockResolvedValue({ cycles: [] });
const listEventTemplates = vi.fn();
const getCycle = vi.fn();
const deleteEventTemplate = vi.fn().mockResolvedValue(undefined);
const listTemplatePrecedences = vi.fn();
const changeTemplatePrecedence = vi.fn().mockResolvedValue({});
const updateEventTemplate = vi.fn();
const getEventTemplateUsage = vi.fn().mockResolvedValue({
  templateId: 'template-1',
  ministryCount: 0,
  blocks: [],
});

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
    deleteEventTemplate: (...args: unknown[]) => deleteEventTemplate(...args),
    getEventTemplateUsage: (...args: unknown[]) =>
      getEventTemplateUsage(...args),
    listTemplatePrecedences: (...args: unknown[]) =>
      listTemplatePrecedences(...args),
    changeTemplatePrecedence: (...args: unknown[]) =>
      changeTemplatePrecedence(...args),
    updateEventTemplate: (...args: unknown[]) => updateEventTemplate(...args),
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
          recurrence: { kind: 'weekly', weekdays: [0] },
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
      within(table).getByRole('columnheader', { name: 'Quando' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Blocos' }),
    ).toBeInTheDocument();

    const row = within(table).getByRole('row', { name: /Sunday Service/ });
    expect(row).toHaveTextContent('Todo domingo');
    expect(row).toHaveTextContent('2');
    expect(
      within(row).getByRole('link', { name: 'Editar Sunday Service' }),
    ).toHaveAttribute('href', '/app/event-templates/template-1');
    expect(
      within(row).getByRole('button', { name: 'Excluir Sunday Service' }),
    ).toBeInTheDocument();
  });

  it('badges only the templates that have public blocks', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          publicBlockCount: 2,
          blocks: [],
        },
        {
          id: 'template-2',
          name: 'Kitchen crew',
          recurrence: { kind: 'weekly', weekdays: [1] },
          publicBlockCount: 0,
          blocks: [],
        },
      ],
    });

    render();

    const table = await screen.findByRole('grid');
    expect(
      within(
        within(table).getByRole('row', { name: /Sunday Service/ }),
      ).getByText('Público'),
    ).toBeInTheDocument();
    expect(
      within(
        within(table).getByRole('row', { name: /Kitchen crew/ }),
      ).queryByText('Público'),
    ).not.toBeInTheDocument();
  });

  it('moves keyboard focus between the actions in a desktop row', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
      ],
    });
    const user = userEvent.setup();
    render();
    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /Sunday Service/ });
    const edit = within(row).getByRole('link', {
      name: 'Editar Sunday Service',
    });
    const precedences = within(row).getByRole('button', {
      name: 'Precedências de Sunday Service',
    });
    const deleteButton = within(row).getByRole('button', {
      name: 'Excluir Sunday Service',
    });
    row.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(edit).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(precedences).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(deleteButton).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(precedences).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(edit).toHaveFocus();
  });

  it('opens a confirmation from the table row action without deleting', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
      ],
    });

    const user = userEvent.setup();
    render();

    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /Sunday Service/ });

    await user.click(
      within(row).getByRole('button', { name: 'Excluir Sunday Service' }),
    );

    expect(
      await screen.findByRole('alertdialog', { name: 'Excluir este modelo?' }),
    ).toBeInTheDocument();
    expect(deleteEventTemplate).not.toHaveBeenCalled();
  });

  it('renders the Delete action with destructive styling, distinct from Edit', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
      ],
    });

    render();

    const table = await screen.findByRole('grid');
    const row = within(table).getByRole('row', { name: /Sunday Service/ });

    expect(
      within(row).getByRole('button', { name: 'Excluir Sunday Service' }),
    ).toHaveClass('text-destructive');
    expect(
      within(row).getByRole('link', { name: 'Editar Sunday Service' }),
    ).not.toHaveClass('text-destructive');
  });

  it('renders the mobile card with the same name, description, and reachable actions as the table row', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
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
    expect(within(mobileRow).getByTestId('edit-template-button')).toHaveClass(
      'min-h-11',
    );
    expect(within(mobileRow).getByTestId('delete-template-button')).toHaveClass(
      'min-h-11',
    );
    expect(
      within(mobileRow).getByTestId('template-precedences-button'),
    ).toHaveClass('min-h-11');
    expect(
      within(mobileRow).getByTestId('edit-template-button'),
    ).toBeInTheDocument();
    expect(
      within(mobileRow).getByTestId('delete-template-button'),
    ).toBeInTheDocument();
  });

  it('opens a confirmation from the mobile card action without deleting', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
      ],
    });

    const user = userEvent.setup();
    render();

    const mobileRow = await screen.findByTestId('saved-template-row');
    await user.click(within(mobileRow).getByTestId('delete-template-button'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(deleteEventTemplate).not.toHaveBeenCalled();
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
      '/app/event-templates/new',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('shows a load failure with retry that refetches the list', async () => {
    listEventTemplates.mockRejectedValueOnce(new Error('boom'));
    listEventTemplates.mockResolvedValueOnce({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
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

describe('TemplateManagerCard loading', () => {
  it('keeps the rows on screen while a refetch is in flight', async () => {
    listEventTemplates.mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Sunday Service',
          recurrence: { kind: 'weekly', weekdays: [0] },
          blocks: [],
        },
      ],
    });
    const queryClient = new QueryClient();
    renderWithProviders(
      <PlanningAdminProvider>
        <TemplateManagerCard />
      </PlanningAdminProvider>,
      { queryClient },
    );
    const row = await screen.findByRole('row', { name: /Sunday Service/ });
    expect(row).toBeInTheDocument();

    await startHangingRefetch({ queryClient, read: listEventTemplates });

    expect(
      screen.getByRole('row', { name: /Sunday Service/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-loading-state')).toBeNull();
  });
});

describe('TemplateManagerCard precedences', () => {
  const sunday = {
    id: 'template-1',
    name: 'Sunday Service',
    recurrence: { kind: 'weekly', weekdays: [0] },
    blocks: [],
  };

  async function openPrecedences() {
    listEventTemplates.mockResolvedValue({ templates: [sunday] });
    const user = userEvent.setup();
    render();
    const mobileRow = await screen.findByTestId('saved-template-row');
    await user.click(
      within(mobileRow).getByTestId('template-precedences-button'),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Precedências de Sunday Service',
    });
    return { user, dialog };
  }

  it('lists the precedences in a dialog off the row and changes one on its own without saving the template', async () => {
    listTemplatePrecedences.mockResolvedValue({
      precedences: [
        {
          otherTemplateId: 'other-1',
          otherTemplateName: 'Culto',
          answer: 'both',
        },
        {
          otherTemplateId: 'other-2',
          otherTemplateName: 'Jovens',
          answer: 'otherWins',
        },
      ],
    });
    const { user, dialog } = await openPrecedences();

    expect(listTemplatePrecedences).toHaveBeenCalledWith('template-1');
    const rows = await within(dialog).findAllByTestId(
      'template-precedence-row',
    );
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]).getByRole('radio', { name: 'Manter os dois' }),
    ).toBeChecked();
    expect(
      within(rows[1]).getByRole('radio', { name: 'O outro vence' }),
    ).toBeChecked();

    await user.click(
      within(rows[0]).getByRole('radio', { name: 'Este vence' }),
    );

    await vi.waitFor(() =>
      expect(changeTemplatePrecedence).toHaveBeenCalledWith(
        'template-1',
        'other-1',
        { answer: 'thisWins' },
      ),
    );
    expect(updateEventTemplate).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Precedência atualizada');
  });

  it('shows an empty state when there are no precedences, and closes', async () => {
    listTemplatePrecedences.mockResolvedValue({ precedences: [] });
    const { user, dialog } = await openPrecedences();

    expect(
      await within(dialog).findByTestId('template-precedences-empty'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
