import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderWithProviders } from '@/tests/setup/render';
import { renderRoute } from '@/tests/setup/render-route';

const listCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getCycle = vi.fn();
const getEventTemplate = vi.fn();
const applyPlanningTemplates = vi.fn();
const deleteCycle = vi.fn();
const getCycleSendSummary = vi.fn();
const sendCycle = vi.fn();
const updateCycle = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
    getEventTemplate: (...args: unknown[]) => getEventTemplate(...args),
    applyPlanningTemplates: (...args: unknown[]) =>
      applyPlanningTemplates(...args),
    deleteCycle: (...args: unknown[]) => deleteCycle(...args),
    updateCycle: (...args: unknown[]) => updateCycle(...args),
    getCycleSendSummary: (...args: unknown[]) => getCycleSendSummary(...args),
    sendCycle: (...args: unknown[]) => sendCycle(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderCycles(initialPath = '/cycles') {
  return renderRoute({ initialPath, churchTimezone: 'UTC' });
}

describe('Cycles routes step-sequence gating (T038, T056)', () => {
  it('defaults to the cycle list view when there are no cycles yet', async () => {
    listCycles.mockResolvedValue({ cycles: [] });

    renderCycles();

    expect(await screen.findByText(m.cycles_list_title())).toBeVisible();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();
    expect(screen.getByTestId('open-create-cycle-dialog-button')).toBeVisible();
  });

  it('navigates to the cycle review URL once a cycle is selected', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'draft',
      },
      events: [],
    });

    const user = userEvent.setup();
    renderCycles();

    expect(await screen.findByText(m.cycles_list_title())).toBeVisible();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();

    const cycleOption = await screen.findByTestId('cycle-option');
    expect(cycleOption).toHaveAttribute('aria-selected', 'false');
    await user.click(cycleOption);

    expect(await screen.findByText(m.cycle_review_title())).toBeVisible();
    expect(
      screen.getByTestId('open-apply-templates-dialog-button'),
    ).toBeVisible();
    expect(
      screen.queryByTestId('open-template-library-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
  });

  it('is read-only when the selected cycle is sent: no apply/manual-event controls', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'sent',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'sent',
      },
      events: [],
    });

    const user = userEvent.setup();
    renderCycles();

    await user.click(await screen.findByTestId('cycle-option'));

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      m.cycle_state_sent(),
    );
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add manual event/i }),
    ).not.toBeInTheDocument();
    // A Sent Cycle still takes a new Event through the complete editor.
    expect(screen.getByTestId('add-event-link')).toBeVisible();
  });

  it('opens New cycle over the list without leaving /cycles, keeping the page title', async () => {
    listCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    const { router } = renderCycles();

    await screen.findByText(m.cycles_list_title());
    await user.click(screen.getByTestId('open-create-cycle-dialog-button'));

    expect(
      await screen.findByRole('dialog', { name: m.cycles_form_title_new() }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/cycles');
    expect(router.state.location.searchStr).toBe('');
    // The h1 lives in the (now aria-hidden, inert) page behind the dialog,
    // so query it directly instead of screen.getByRole('heading', ...),
    // which excludes aria-hidden content from the accessibility tree.
    expect(document.querySelector('h1')).toHaveTextContent(m.cycles_title());
  });

  it('keeps the template library as a saved-list view and opens creation on a nested page without loading a cycle', async () => {
    listCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    renderCycles('/event-templates');

    expect(await screen.findByText('Modelos salvos')).toBeVisible();
    expect(screen.queryByTestId('template-name-input')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('back-from-template-library-button'),
    ).toBeNull();

    await user.click(screen.getByTestId('new-template-button'));

    expect(await screen.findByTestId('template-create-page')).toBeVisible();
    expect(screen.getByTestId('template-name-input')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getCycle).not.toHaveBeenCalled();
  });

  it('opens a saved template on its nested edit page from the library list', async () => {
    const template = {
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
    };
    listCycles.mockResolvedValue({ cycles: [] });
    listEventTemplates.mockResolvedValue({ templates: [template] });
    getEventTemplate.mockResolvedValue(template);

    const user = userEvent.setup();
    renderCycles('/event-templates');

    await user.click(await screen.findByTestId('edit-template-button'));

    expect(await screen.findByTestId('template-edit-page')).toBeVisible();
    expect(await screen.findByTestId('template-name-input')).toHaveValue(
      'Sunday Service',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the nested edit page directly, without list state', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    listEventTemplates.mockClear();
    getEventTemplate.mockResolvedValue({
      id: 'template-9',
      name: 'Vigil',
      weekday: 5,
      blocks: [
        {
          id: 'block-9',
          label: 'Watch',
          startTime: '22:00',
          endTime: '02:00',
          order: 0,
        },
      ],
    });

    renderCycles('/event-templates/template-9');

    expect(await screen.findByTestId('template-name-input')).toHaveValue(
      'Vigil',
    );
    expect(getEventTemplate).toHaveBeenCalledWith('template-9');
  });

  it('keeps the apply-templates dialog open and displays an inline error when template application fails', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'draft',
      },
      events: [],
    });
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
    applyPlanningTemplates.mockRejectedValue(
      Object.assign(new AxiosError('Conflict'), {
        response: {
          status: 409,
          data: { message: 'Apply templates failed due to conflict' },
        } as AxiosResponse,
      }),
    );

    const user = userEvent.setup();
    renderCycles();

    await user.click(await screen.findByTestId('cycle-option'));
    await user.click(screen.getByTestId('open-apply-templates-dialog-button'));

    expect(
      await screen.findByRole('dialog', { name: 'Aplicar modelos' }),
    ).toBeVisible();

    const checkbox = screen.getByTestId('template-select-checkbox');
    await waitFor(() => expect(checkbox).toBeChecked());

    const applyButton = screen.getByTestId('apply-templates-button');
    await user.click(applyButton);

    expect(
      screen.getByRole('dialog', { name: 'Aplicar modelos' }),
    ).toBeVisible();
    expect(
      await screen.findByTestId('apply-templates-error'),
    ).toHaveTextContent('Apply templates failed due to conflict');
    expect(checkbox).toBeChecked();
  });
});

describe('CyclesActions (US4)', () => {
  it('renders "Add event" beside "Apply template" for a draft cycle, linking to its nested New Event page', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'draft',
      },
      events: [],
    });

    const user = userEvent.setup();
    renderCycles();

    await user.click(await screen.findByTestId('cycle-option'));

    const actionsRow = await screen.findByTestId('cycles-actions-row');
    const applyTemplateButton = within(actionsRow).getByTestId(
      'open-apply-templates-dialog-button',
    );
    const addEventLink = within(actionsRow).getByRole('link', {
      name: m.cycles_add_event_button(),
    });
    expect(applyTemplateButton).toBeVisible();
    expect(applyTemplateButton).toHaveTextContent('Aplicar modelo');
    expect(addEventLink).toHaveTextContent('Adicionar evento');
    expect(addEventLink).toHaveAttribute('href', '/cycles/cycle-1/events/new');
  });

  it('does not render a "Manual exceptions" panel in the review body', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'draft',
      },
      events: [],
    });

    const user = userEvent.setup();
    renderCycles();

    await user.click(await screen.findByTestId('cycle-option'));
    await screen.findByText(m.cycle_review_title());

    expect(screen.queryByText('Manual exceptions')).not.toBeInTheDocument();
  });
});

describe('Cycle deletion', () => {
  function mockCycle(state: 'draft' | 'sent') {
    const cycle = {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      state,
    };
    listCycles.mockResolvedValue({ cycles: [cycle] });
    getCycle.mockResolvedValue({ cycle, events: [] });
  }

  it('offers Delete only on a Draft, behind a confirmation that deletes nothing until confirmed', async () => {
    mockCycle('draft');
    const user = userEvent.setup();
    renderCycles();
    await user.click(await screen.findByTestId('cycle-option'));

    await user.click(await screen.findByTestId('delete-cycle-button'));

    expect(
      await screen.findByRole('alertdialog', { name: 'Excluir August 2026?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Manter rascunho' }));
    expect(deleteCycle).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not offer Delete on a sent Cycle', async () => {
    mockCycle('sent');
    const user = userEvent.setup();
    renderCycles();
    await user.click(await screen.findByTestId('cycle-option'));

    await screen.findByTestId('selected-cycle-state');

    expect(screen.queryByTestId('delete-cycle-button')).not.toBeInTheDocument();
  });

  it('returns to the refreshed list with no selection after a confirmed delete', async () => {
    mockCycle('draft');
    deleteCycle.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCycles();
    await user.click(await screen.findByTestId('cycle-option'));
    await user.click(await screen.findByTestId('delete-cycle-button'));
    listCycles.mockResolvedValue({ cycles: [] });

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    expect(await screen.findByText(m.cycles_list_title())).toBeVisible();
    expect(deleteCycle).toHaveBeenCalledWith('cycle-1');
    expect(screen.queryByTestId('cycle-option')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selected-cycle-name')).not.toBeInTheDocument();
  });
});

describe('Cycle deletion and Apply against a stale Draft', () => {
  const draft = {
    id: 'cycle-1',
    name: 'August 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    state: 'draft',
  };

  function eventGroup(id: string, status: string) {
    return {
      event: {
        id,
        title: id,
        start: '2026-08-02T13:00:00.000Z',
        end: '2026-08-02T15:00:00.000Z',
        status,
      },
      eventTimeBlocks: [],
    };
  }

  function refusal(status: number, message: string) {
    const error = new AxiosError(message);
    error.response = {
      status,
      data: { message },
    } as AxiosResponse;
    return error;
  }

  it('counts every owned Event in the delete confirmation, cancelled ones included', async () => {
    listCycles.mockResolvedValue({ cycles: [draft] });
    getCycle.mockResolvedValue({
      cycle: draft,
      events: [
        eventGroup('e1', 'scheduled'),
        eventGroup('e2', 'cancelled'),
        eventGroup('e3', 'cancelled'),
      ],
    });
    const user = userEvent.setup();
    renderCycles('/cycles/cycle-1');

    await user.click(await screen.findByTestId('delete-cycle-button'));

    expect(await screen.findByTestId('cycle-delete-count')).toHaveTextContent(
      '3 eventos serão excluídos',
    );
  });

  it('refetches after a stale delete refusal, shows the refusal and hides the Draft actions', async () => {
    listCycles.mockResolvedValue({ cycles: [draft] });
    getCycle.mockResolvedValue({ cycle: draft, events: [] });
    deleteCycle.mockRejectedValue(
      refusal(409, 'Only a Draft Cycle can be deleted.'),
    );
    const user = userEvent.setup();
    renderCycles('/cycles/cycle-1');
    await user.click(await screen.findByTestId('delete-cycle-button'));
    getCycle.mockResolvedValue({
      cycle: { ...draft, state: 'sent' },
      events: [],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId('delete-cycle-button'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('edit-cycle-button')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
  });

  it('refetches after a stale Apply refusal and hides the Draft actions', async () => {
    listCycles.mockResolvedValue({ cycles: [draft] });
    getCycle.mockResolvedValue({ cycle: draft, events: [] });
    const sunday = {
      id: 'template-1',
      name: 'Sunday',
      weekday: 0,
      blocks: [],
    };
    listEventTemplates.mockResolvedValue({ templates: [sunday] });
    applyPlanningTemplates.mockRejectedValue(
      refusal(409, 'Only a Draft Cycle can take templates.'),
    );
    const user = userEvent.setup();
    renderCycles('/cycles/cycle-1');
    await user.click(
      await screen.findByTestId('open-apply-templates-dialog-button'),
    );
    getCycle.mockResolvedValue({
      cycle: { ...draft, state: 'sent' },
      events: [],
    });
    await screen.findAllByTestId('template-select-checkbox');

    await user.click(screen.getByTestId('apply-templates-button'));

    await waitFor(() =>
      expect(
        screen.queryByTestId('delete-cycle-button'),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
    listEventTemplates.mockResolvedValue({ templates: [] });
  });
});

describe('Cycle edit', () => {
  const draft = {
    id: 'cycle-1',
    name: 'August 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    state: 'draft' as const,
  };

  it('edits a Draft in place, refreshing its name on the same detail', async () => {
    const renamed = { ...draft, name: 'Retiro de agosto' };
    listCycles.mockResolvedValue({ cycles: [draft] });
    getCycle.mockResolvedValue({ cycle: draft, events: [] });
    updateCycle.mockImplementation(async () => {
      listCycles.mockResolvedValue({ cycles: [renamed] });
      getCycle.mockResolvedValue({ cycle: renamed, events: [] });
      return renamed;
    });
    const user = userEvent.setup();
    renderCycles();
    await user.click(await screen.findByTestId('cycle-option'));

    await user.click(await screen.findByTestId('edit-cycle-button'));
    const name = await screen.findByTestId('cycle-name-input');
    expect(name).toHaveValue('August 2026');
    await user.clear(name);
    await user.type(name, 'Retiro de agosto');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(screen.getByTestId('selected-cycle-name')).toHaveTextContent(
        'Retiro de agosto',
      ),
    );
    expect(updateCycle).toHaveBeenCalledWith('cycle-1', {
      name: 'Retiro de agosto',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not offer Edit on a sent Cycle', async () => {
    const sent = { ...draft, state: 'sent' as const };
    listCycles.mockResolvedValue({ cycles: [sent] });
    getCycle.mockResolvedValue({ cycle: sent, events: [] });
    const user = userEvent.setup();
    renderCycles();
    await user.click(await screen.findByTestId('cycle-option'));

    await screen.findByTestId('selected-cycle-state');

    expect(screen.queryByTestId('edit-cycle-button')).not.toBeInTheDocument();
  });
});

describe('Cycle header visibility (chip-leak fix)', () => {
  it('shows list-level total/draft/sent chips, not per-cycle chips, on the plain list route', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
        {
          id: 'cycle-2',
          name: 'September 2026',
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-30T00:00:00.000Z',
          state: 'sent',
        },
      ],
    });

    renderCycles();

    expect(await screen.findByTestId('cycles-total-chip')).toHaveTextContent(
      '2',
    );
    expect(screen.getByTestId('cycles-draft-chip')).toHaveTextContent('1');
    expect(screen.getByTestId('cycles-sent-chip')).toHaveTextContent(
      m.cycles_state_sent(),
    );
    expect(screen.getByTestId('cycles-sent-chip')).toHaveTextContent('1');
    expect(screen.queryByTestId('cycle-period-chip')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cycle-event-count-chip'),
    ).not.toBeInTheDocument();
  });

  it('clears the selected-cycle stat chips after navigating back to the plain list route', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        state: 'draft',
      },
      events: [],
    });

    const user = userEvent.setup();
    const { router } = renderCycles();

    await user.click(await screen.findByTestId('cycle-option'));
    expect(await screen.findByTestId('cycle-period-chip')).toBeInTheDocument();

    await router.navigate({ to: '/cycles' });

    expect(await screen.findByTestId('cycles-total-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('cycle-period-chip')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cycle-event-count-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cycle-event-time-block-count-chip'),
    ).not.toBeInTheDocument();
  });

  it('shows a saved-template-count chip on the template library route', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    listEventTemplates.mockResolvedValue({
      templates: [
        { id: 'template-1', name: 'Sunday Service', weekday: 0, blocks: [] },
        { id: 'template-2', name: 'Midweek', weekday: 3, blocks: [] },
      ],
    });

    renderCycles('/event-templates');

    await waitFor(() =>
      expect(
        screen.getByTestId('planning-templates-total-chip'),
      ).toHaveTextContent('2'),
    );
    expect(screen.queryByTestId('cycles-total-chip')).not.toBeInTheDocument();
  });
});

describe('CycleListCard selection state', () => {
  it('renders cycles with correct aria-selected attribute based on selection', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'draft',
        },
        {
          id: 'cycle-2',
          name: 'September 2026',
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-30T00:00:00.000Z',
          state: 'draft',
        },
      ],
    });

    renderWithProviders(
      <PlanningAdminProvider>
        <CycleListCard selectedCycleId="cycle-1" />
      </PlanningAdminProvider>,
    );

    const options = await screen.findAllByTestId('cycle-option');
    // Newest start first: September, then the selected August.
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Direct Cycle review route', () => {
  function details({
    id,
    name,
    state,
  }: {
    id: string;
    name: string;
    state: string;
  }) {
    return {
      cycle: {
        id,
        name,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
        state,
      },
      events: [
        {
          event: {
            id: `${id}-event`,
            title: 'Sunday Service',
            start: '2026-10-18T13:00:00.000Z',
            end: '2026-10-18T15:00:00.000Z',
            status: 'scheduled',
          },
          eventTimeBlocks: [
            {
              id: `${id}-block`,
              label: 'Worship',
              startTime: '2026-10-18T13:00:00.000Z',
              endTime: '2026-10-18T15:00:00.000Z',
            },
          ],
        },
      ],
    };
  }

  it.each([
    'sent',
    'past',
  ] as const)('keeps a %s Cycle read-only with localized state and counts', async (state) => {
    listCycles.mockResolvedValue({ cycles: [] });
    getCycle.mockResolvedValue(
      details({ id: 'cycle-1', name: 'October', state }),
    );

    renderCycles('/cycles/cycle-1');

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      state === 'sent' ? m.cycle_state_sent() : m.cycle_state_past(),
    );
    expect(screen.getByTestId('cycle-event-count-chip')).toHaveTextContent('1');
    expect(
      screen.getByTestId('cycle-event-time-block-count-chip'),
    ).toHaveTextContent('1');
    expect(screen.getByTestId('cycle-period-chip')).toHaveTextContent(
      '12/10/2026 → 25/10/2026',
    );
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-cycle-button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Edit|Delete|Add)/ }),
    ).not.toBeInTheDocument();
  });

  it('refetches the Cycle after Send and removes its Draft controls', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    getCycle.mockResolvedValue(
      details({ id: 'cycle-1', name: 'October', state: 'draft' }),
    );
    getCycleSendSummary.mockResolvedValue({
      eventCount: 1,
      prefilledMinistryCount: 0,
    });
    sendCycle.mockImplementation(async () => {
      getCycle.mockResolvedValue(
        details({ id: 'cycle-1', name: 'October', state: 'sent' }),
      );
    });
    const user = userEvent.setup();
    renderCycles('/cycles/cycle-1');

    await user.click(await screen.findByTestId('send-cycle-button'));
    expect(await screen.findByText(m.cycle_send_prefill_zero())).toBeVisible();
    await user.click(screen.getByTestId('confirm-cycle-send-button'));

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      m.cycle_state_sent(),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('send-cycle-button')).not.toBeInTheDocument(),
    );
    expect(sendCycle).toHaveBeenCalledWith('cycle-1');
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
  });

  it('never shows the previously reviewed Cycle while navigating directly to another', async () => {
    listCycles.mockResolvedValue({ cycles: [] });
    getCycle.mockImplementation(async (id: string) =>
      id === 'cycle-1'
        ? details({ id, name: 'First Cycle', state: 'draft' })
        : new Promise(() => undefined),
    );

    const { router } = renderCycles('/cycles/cycle-1');
    expect((await screen.findAllByText('First Cycle'))[0]).toBeVisible();

    await router.navigate({
      to: '/cycles/$cycleId',
      params: { cycleId: 'cycle-2' },
    });

    expect(await screen.findByTestId('cycle-review-loading')).toBeVisible();
    expect(screen.queryByText('First Cycle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-cycle-button')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
  });
});
