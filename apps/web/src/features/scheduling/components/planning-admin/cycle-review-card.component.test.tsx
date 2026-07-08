import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from './cycle-list-card';
import { CycleReviewCard } from './cycle-review-card';
import { PlanningAdminProvider } from './planning-admin-context';
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

function render({ isReadOnly = false }: { isReadOnly?: boolean } = {}) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard />
      <CycleReviewCard isReadOnly={isReadOnly} />
    </PlanningAdminProvider>,
  );
}

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('planning-cycle-option'));
  return user;
}

function twoEventCycleResponse({ state }: { state: 'draft' | 'locked' }) {
  return {
    cycle: {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      state,
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
  };
}

describe('CycleReviewCard table view (US2)', () => {
  it('renders each weekday entry as a collapsed row and expands to reveal its slots', async () => {
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );

    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(within(table).queryByText('Midweek')).not.toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expand Wednesday Service' }),
    );
    expect(within(table).getByText('Slot')).toBeInTheDocument();
    expect(within(table).getByText('Worship')).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Collapse Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).getByText('Slot')).toBeInTheDocument();
  });

  it('keeps the locked cycle table read-only with no new editing affordance', async () => {
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'locked' }),
    );

    render({ isReadOnly: true });
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(table).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add manual event' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('lock-cycle-button')).not.toBeInTheDocument();
  });

  it('shows the empty-state message instead of an empty table when the cycle has no events', async () => {
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

    render();
    await selectTheOnlyCycle();

    expect(
      await screen.findByText(
        'No events in this cycle yet. Apply templates or add a manual event.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('grid', { name: 'Calendar review' }),
    ).not.toBeInTheDocument();
  });
});
