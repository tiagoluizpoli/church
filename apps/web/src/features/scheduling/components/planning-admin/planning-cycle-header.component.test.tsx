import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('planning-cycle-option'));
  return user;
}

// Period bounds are fixed UTC instants, not bare `yyyy-MM-dd` days: the header
// formats them as instants in the Church Timezone, and a bare day parses at
// the runner's local midnight — which made the rendered day depend on the
// ambient TZ the suite pins (vitest.config.ts).
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
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          state: 'locked',
        },
      ],
    });
    getPlanningCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
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
    expect(periodChip).toHaveTextContent('01/08/2026');
    expect(periodChip).toHaveTextContent('31/08/2026');
    expect(periodChip).not.toHaveTextContent('August 2026');
  });

  it('renders event-count and slot-count chips sourced from the selected cycle', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
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

  it('changes the window chip dates with the Church Timezone', async () => {
    const cycle = {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      state: 'draft' as const,
    };
    listPlanningCycles.mockResolvedValue({ cycles: [cycle] });
    getPlanningCycle.mockResolvedValue({ cycle, events: [] });

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    const utcPeriodText = (
      await screen.findByTestId('planning-cycle-period-chip')
    ).textContent;

    cleanup();

    // Niue is UTC-11: the fixed instants above (Aug 1/31 00:00 UTC) read as
    // the previous CalendarDay there, unlike Kiritimati (UTC+14, same day).
    render({ churchTimezone: 'Pacific/Niue' });
    await selectTheOnlyCycle();
    const niuePeriodText = (
      await screen.findByTestId('planning-cycle-period-chip')
    ).textContent;

    expect(niuePeriodText).not.toBe(utcPeriodText);
  });
});
