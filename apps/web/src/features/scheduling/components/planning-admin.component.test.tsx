import { screen } from '@testing-library/react';
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

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
    applyPlanningTemplates: (...args: unknown[]) =>
      applyPlanningTemplates(...args),
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

    expect(await screen.findByText('Selected cycle review')).toBeVisible();
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
