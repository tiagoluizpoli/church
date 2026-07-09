import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/shared/utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/utils/date')>();
  return {
    ...actual,
    getBrowserTimezone: () => 'America/New_York',
  };
});

interface RenderPlanningCycleHeaderInput {
  churchTimezone?: string;
}

function render({ churchTimezone }: RenderPlanningCycleHeaderInput = {}) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <PlanningCycleHeader />
      <CycleListCard />
    </PlanningAdminProvider>,
    { churchTimezone },
  );
}

beforeEach(() => {
  localStorage.clear();
});

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('planning-cycle-option'));
  return user;
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
    expect(periodChip).toHaveTextContent('Aug 1, 2026');
    expect(periodChip).toHaveTextContent('Aug 31, 2026');
    expect(periodChip).not.toHaveTextContent('August 2026');
  });

  it('renders event-count and slot-count chips sourced from the selected cycle', async () => {
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
      events: [
        {
          event: {
            id: 'event-1',
            title: 'Sunday Service',
            startDate: '2026-08-02T09:00:00Z',
            endDate: '2026-08-02T11:00:00Z',
            eventType: 'service',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'slot-1',
              label: 'Worship',
              startTime: '2026-08-02T09:00:00Z',
              endTime: '2026-08-02T10:00:00Z',
            },
            {
              id: 'slot-2',
              label: 'Message',
              startTime: '2026-08-02T10:00:00Z',
              endTime: '2026-08-02T11:00:00Z',
            },
          ],
        },
        {
          event: {
            id: 'event-2',
            title: 'Wednesday Service',
            startDate: '2026-08-05T19:00:00Z',
            endDate: '2026-08-05T20:00:00Z',
            eventType: 'service',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'slot-3',
              label: null,
              startTime: '2026-08-05T19:00:00Z',
              endTime: '2026-08-05T20:00:00Z',
            },
          ],
        },
      ],
    });

    render();
    await selectTheOnlyCycle();

    const eventCountChip = await screen.findByTestId(
      'planning-cycle-event-count-chip',
    );
    const slotCountChip = screen.getByTestId('planning-cycle-slot-count-chip');

    expect(eventCountChip).toHaveTextContent('2');
    expect(slotCountChip).toHaveTextContent('3');
  });

  it('changes the window chip dates when the timezone mode toggles between church and local', async () => {
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

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    const churchModePeriodText = (
      await screen.findByTestId('planning-cycle-period-chip')
    ).textContent;

    cleanup();
    localStorage.setItem('church_timezone_mode', 'user');

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    const localModePeriodText = (
      await screen.findByTestId('planning-cycle-period-chip')
    ).textContent;

    expect(localModePeriodText).not.toBe(churchModePeriodText);
  });
});
