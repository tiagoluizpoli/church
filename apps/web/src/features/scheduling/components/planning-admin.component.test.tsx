import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from './planning-admin/cycle-list-card';
import { PlanningAdminProvider } from './planning-admin/planning-admin-context';
import { renderWithProviders } from '@/__tests__/setup/render';
import { renderRoute } from '@/__tests__/setup/render-route';

const listPlanningCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getPlanningCycle = vi.fn();
const applyPlanningTemplates = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
const getActiveChurchStatus = vi
  .fn()
  .mockResolvedValue({ status: 'resolved', churchId: 'church-1' });

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
    applyPlanningTemplates: (...args: unknown[]) =>
      applyPlanningTemplates(...args),
  },
  activeChurchApi: {
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderPlanningCycles(initialPath = '/scheduling/planning-cycles') {
  return renderRoute({ initialPath });
}

describe('Planning cycles routes step-sequence gating (T038, T056)', () => {
  it('defaults to the cycle list view when there are no cycles yet', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
    expect(screen.queryByText('Event templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();
    expect(screen.getByTestId('open-create-cycle-dialog-button')).toBeVisible();
  });

  it('navigates to the cycle review URL once a cycle is selected', async () => {
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
    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();

    const cycleOption = await screen.findByTestId('planning-cycle-option');
    expect(cycleOption).toHaveAttribute('aria-selected', 'false');
    await user.click(cycleOption);

    expect(await screen.findByText('Calendar review')).toBeVisible();
    expect(
      screen.getByTestId('open-apply-templates-dialog-button'),
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
    renderPlanningCycles();

    await user.click(await screen.findByTestId('planning-cycle-option'));

    expect(await screen.findByTestId('selected-cycle-state')).toHaveTextContent(
      'locked',
    );
    expect(
      screen.queryByTestId('open-apply-templates-dialog-button'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add manual event/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the "Cycles" page title behind the create-cycle dialog instead of swapping it to "Create cycle"', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    renderPlanningCycles();

    await screen.findByText('Existing cycles');
    await user.click(screen.getByTestId('open-create-cycle-dialog-button'));

    expect(
      await screen.findByRole('dialog', { name: 'Create cycle' }),
    ).toBeVisible();
    // The h1 lives in the (now aria-hidden, inert) page behind the dialog,
    // so query it directly instead of screen.getByRole('heading', ...),
    // which excludes aria-hidden content from the accessibility tree.
    expect(document.querySelector('h1')).toHaveTextContent('Cycles');
  });

  it('keeps the template library as a saved-list view and opens creation in a dialog', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    const user = userEvent.setup();
    renderPlanningCycles();

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
    renderPlanningCycles();

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

  it('keeps the apply-templates dialog open and displays an inline error when template application fails', async () => {
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
      new Error('Apply templates failed due to conflict'),
    );

    const user = userEvent.setup();
    renderPlanningCycles();

    await user.click(await screen.findByTestId('planning-cycle-option'));
    await user.click(screen.getByTestId('open-apply-templates-dialog-button'));

    expect(
      await screen.findByRole('dialog', { name: 'Apply templates' }),
    ).toBeVisible();

    const checkbox = screen.getByTestId('template-select-checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const applyButton = screen.getByTestId('apply-templates-button');
    await user.click(applyButton);

    expect(
      screen.getByRole('dialog', { name: 'Apply templates' }),
    ).toBeVisible();
    expect(
      await screen.findByTestId('apply-templates-error'),
    ).toHaveTextContent('Apply templates failed due to conflict');
    expect(checkbox).toBeChecked();
  });
});

describe('PlanningCyclesActions (US4)', () => {
  it('renders "Add event" beside "Apply template" in the top action row for a draft cycle, and opens the create-event modal', async () => {
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
    renderPlanningCycles();

    await user.click(await screen.findByTestId('planning-cycle-option'));

    const actionsRow = await screen.findByTestId('planning-cycles-actions-row');
    const applyTemplateButton = within(actionsRow).getByTestId(
      'open-apply-templates-dialog-button',
    );
    const addManualEventButton = within(actionsRow).getByRole('button', {
      name: 'Add event',
    });
    expect(applyTemplateButton).toBeVisible();
    expect(addManualEventButton).toBeVisible();

    await user.click(addManualEventButton);

    expect(
      await screen.findByRole('dialog', { name: 'New Event' }),
    ).toBeVisible();
  });

  it('does not render a "Manual exceptions" panel in the review body', async () => {
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
    renderPlanningCycles();

    await user.click(await screen.findByTestId('planning-cycle-option'));
    await screen.findByText('Calendar review');

    expect(screen.queryByText('Manual exceptions')).not.toBeInTheDocument();
  });
});

describe('Planning cycle header visibility (chip-leak fix)', () => {
  it('shows list-level total/draft/locked chips, not per-cycle chips, on the plain list route', async () => {
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
        {
          id: 'cycle-2',
          name: 'September 2026',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          state: 'locked',
        },
      ],
    });

    renderPlanningCycles();

    expect(
      await screen.findByTestId('planning-cycles-total-chip'),
    ).toHaveTextContent('2');
    expect(screen.getByTestId('planning-cycles-draft-chip')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('planning-cycles-locked-chip')).toHaveTextContent(
      '1',
    );
    expect(
      screen.queryByTestId('planning-cycle-period-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-cycle-event-count-chip'),
    ).not.toBeInTheDocument();
  });

  it('clears the selected-cycle stat chips after navigating back to the plain list route', async () => {
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
    const { router } = renderPlanningCycles();

    await user.click(await screen.findByTestId('planning-cycle-option'));
    expect(
      await screen.findByTestId('planning-cycle-period-chip'),
    ).toBeInTheDocument();

    await router.navigate({ to: '/scheduling/planning-cycles' });

    expect(
      await screen.findByTestId('planning-cycles-total-chip'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-cycle-period-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-cycle-event-count-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-cycle-slot-count-chip'),
    ).not.toBeInTheDocument();
  });

  it('shows a saved-template-count chip on the template library route', async () => {
    listPlanningCycles.mockResolvedValue({ cycles: [] });
    listEventTemplates.mockResolvedValue({
      templates: [
        { id: 'template-1', name: 'Sunday Service', weekday: 0, blocks: [] },
        { id: 'template-2', name: 'Midweek', weekday: 3, blocks: [] },
      ],
    });

    const user = userEvent.setup();
    renderPlanningCycles();

    await screen.findByText('Existing cycles');
    await user.click(screen.getByTestId('open-template-library-button'));

    expect(
      await screen.findByTestId('planning-templates-total-chip'),
    ).toHaveTextContent('2');
    expect(
      screen.queryByTestId('planning-cycles-total-chip'),
    ).not.toBeInTheDocument();
  });
});

describe('CycleListCard selection state', () => {
  it('renders cycles with correct aria-selected attribute based on selection', async () => {
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
        {
          id: 'cycle-2',
          name: 'September 2026',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          state: 'draft',
        },
      ],
    });

    renderWithProviders(
      <PlanningAdminProvider>
        <CycleListCard selectedCycleId="cycle-1" />
      </PlanningAdminProvider>,
    );

    const options = await screen.findAllByTestId('planning-cycle-option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });
});
