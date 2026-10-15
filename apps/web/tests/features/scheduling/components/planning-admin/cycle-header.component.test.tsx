import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleHeader } from '@/features/scheduling/components/planning-admin/cycle-header';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getCycle = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
  },
}));

interface RenderCycleHeaderInput {
  churchTimezone?: string;
}

function render({ churchTimezone }: RenderCycleHeaderInput = {}) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleHeader />
      <CycleListCard />
    </PlanningAdminProvider>,
    { churchTimezone },
  );
}

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('cycle-option'));
  return user;
}

describe('CycleHeader (T058)', () => {
  it('renders nothing when no cycle is selected', () => {
    listCycles.mockResolvedValue({ cycles: [] });

    render();

    expect(
      screen.queryByTestId('cycle-name-status-chip'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('cycle-period-chip')).not.toBeInTheDocument();
  });

  it('renders the name+status chip and the period chip as two separate elements', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'sent',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'sent',
      },
      events: [],
    });

    const user = userEvent.setup();
    render();

    await user.click(await screen.findByTestId('cycle-option'));

    const nameStatusChip = await screen.findByTestId('cycle-name-status-chip');
    const periodChip = screen.getByTestId('cycle-period-chip');

    expect(nameStatusChip).not.toBe(periodChip);
    expect(nameStatusChip).toHaveTextContent('August 2026');
    expect(screen.getByTestId('selected-cycle-state')).toHaveTextContent(
      'sent',
    );
    expect(periodChip).toHaveTextContent('01/08/2026');
    expect(periodChip).toHaveTextContent('31/08/2026');
    expect(periodChip).not.toHaveTextContent('August 2026');
  });

  it('renders event-count and event-time-block-count chips sourced from the selected cycle', async () => {
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
      events: [
        {
          event: {
            id: 'event-1',
            title: 'Sunday Service',
            start: '2026-08-02T09:00:00Z',
            end: '2026-08-02T11:00:00Z',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'event-time-block-1',
              label: 'Worship',
              startTime: '2026-08-02T09:00:00Z',
              endTime: '2026-08-02T10:00:00Z',
            },
            {
              id: 'event-time-block-2',
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
            start: '2026-08-05T19:00:00Z',
            end: '2026-08-05T20:00:00Z',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'event-time-block-3',
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

    const eventCountChip = await screen.findByTestId('cycle-event-count-chip');
    const eventTimeBlockCountChip = screen.getByTestId(
      'cycle-event-time-block-count-chip',
    );

    expect(eventCountChip).toHaveTextContent('2');
    expect(eventTimeBlockCountChip).toHaveTextContent('3');
  });

  it('renders CalendarDay bounds independently of the Church Timezone', async () => {
    const cycle = {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      state: 'draft' as const,
    };
    listCycles.mockResolvedValue({ cycles: [cycle] });
    getCycle.mockResolvedValue({ cycle, events: [] });

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    const utcPeriodText = (await screen.findByTestId('cycle-period-chip'))
      .textContent;

    cleanup();

    render({ churchTimezone: 'Pacific/Niue' });
    await selectTheOnlyCycle();
    const niuePeriodText = (await screen.findByTestId('cycle-period-chip'))
      .textContent;

    expect(niuePeriodText).toBe(utcPeriodText);
  });
});
