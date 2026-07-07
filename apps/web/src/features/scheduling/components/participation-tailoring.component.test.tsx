import { screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ParticipationTailoring } from './participation-tailoring';
import { renderWithProviders } from '@/__tests__/setup/render';

const listMinistries = vi.fn();
const listEvents = vi.fn();
const getCycleParticipation = vi.fn();
const getScheduleBuilderData = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listEvents: (...args: unknown[]) => listEvents(...args),
    getCycleParticipation: (...args: unknown[]) =>
      getCycleParticipation(...args),
    getScheduleBuilderData: (...args: unknown[]) =>
      getScheduleBuilderData(...args),
  },
}));

interface MockLinkProps {
  children: React.ReactNode;
  to: string;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: MockLinkProps) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function render() {
  return renderWithProviders(<ParticipationTailoring />);
}

interface MinistrySummary {
  id: string;
  name: string;
}

interface EventSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  planningCycleId: string | null;
}

interface RoleSummary {
  id: string;
  name: string;
}

describe('ParticipationTailoring', () => {
  it('renders loading states, list of ministries, and handles events loading errors', async () => {
    const ministriesData: MinistrySummary[] = [
      { id: 'ministry-1', name: 'Worship' },
    ];
    listMinistries.mockResolvedValue({ ministries: ministriesData });
    listEvents.mockRejectedValue(new Error('Failed to load cycle events'));

    render();

    // The events error should be displayed in the right panel
    const errorState = await screen.findByTestId('events-error-state');
    expect(errorState).toBeVisible();
    expect(errorState).toHaveTextContent('Failed to load cycle events');

    // Selectors should be visible
    expect(screen.getByRole('combobox', { name: 'Ministry' })).toBeVisible();
  });

  it('renders participation cards and displays event-specific roles when roles diverge', async () => {
    const ministriesData: MinistrySummary[] = [
      { id: 'ministry-1', name: 'Worship' },
    ];
    const eventsData: EventSummary[] = [
      {
        id: 'event-1',
        title: 'Sunday AM Service',
        startDate: '2026-08-02T09:00:00Z',
        endDate: '2026-08-02T12:30:00Z',
        planningCycleId: 'cycle-1',
      },
      {
        id: 'event-2',
        title: 'Sunday PM Service',
        startDate: '2026-08-02T18:00:00Z',
        endDate: '2026-08-02T20:30:00Z',
        planningCycleId: 'cycle-1',
      },
    ];

    const participationData = {
      events: [
        {
          participation: { id: 'part-1', state: 'draft' },
          event: eventsData[0],
          slots: [
            {
              included: true,
              slot: {
                id: 'slot-1',
                name: 'Morning',
                startTime: '2026-08-02T09:00:00Z',
                endTime: '2026-08-02T12:30:00Z',
              },
              requirements: [],
              shifts: [
                {
                  id: 'shift-1',
                  label: 'Shift 1',
                  startTime: '2026-08-02T09:00:00Z',
                  endTime: '2026-08-02T10:30:00Z',
                  headcounts: [
                    {
                      role: { id: 'role-worship', name: 'Worship Leader' },
                      count: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          participation: { id: 'part-2', state: 'draft' },
          event: eventsData[1],
          slots: [
            {
              included: true,
              slot: {
                id: 'slot-2',
                name: 'Evening',
                startTime: '2026-08-02T18:00:00Z',
                endTime: '2026-08-02T20:30:00Z',
              },
              requirements: [],
              shifts: [
                {
                  id: 'shift-2',
                  label: 'Shift 2',
                  startTime: '2026-08-02T18:00:00Z',
                  endTime: '2026-08-02T19:30:00Z',
                  headcounts: [
                    { role: { id: 'role-tech', name: 'Sound Tech' }, count: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    listMinistries.mockResolvedValue({ ministries: ministriesData });
    listEvents.mockResolvedValue({ events: eventsData });
    getCycleParticipation.mockResolvedValue(participationData);

    // Mock divergent roles per event
    getScheduleBuilderData.mockImplementation(async (params: unknown) => {
      const { eventId } = params as { eventId: string };
      if (eventId === 'event-1') {
        const roles: RoleSummary[] = [
          { id: 'role-worship', name: 'Worship Leader' },
        ];
        return { roles };
      }
      if (eventId === 'event-2') {
        const roles: RoleSummary[] = [{ id: 'role-tech', name: 'Sound Tech' }];
        return { roles };
      }
      return { roles: [] };
    });

    render();

    // Verify both event titles are visible
    expect(await screen.findByText('Sunday AM Service')).toBeVisible();
    expect(await screen.findByText('Sunday PM Service')).toBeVisible();

    // Verify first card shows its event role: "Worship Leader"
    expect(await screen.findByText('Worship Leader')).toBeVisible();

    // Verify second card shows its event role: "Sound Tech"
    expect(await screen.findByText('Sound Tech')).toBeVisible();
  });
});
