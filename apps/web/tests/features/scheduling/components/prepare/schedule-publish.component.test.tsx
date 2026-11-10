import { m } from '@church/i18n/messages';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchedulePublish } from '@/features/scheduling/components/prepare/schedule-publish';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as CycleBuilderData | undefined,
  mutate: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/features/scheduling/hooks/use-cycle-builder', () => ({
  useCycleBuilder: () => ({
    data: state.data,
    publish: { isPending: false, mutate: state.mutate },
    sendUpdates: { isPending: false, mutate: state.send },
  }),
}));

beforeEach(() => {
  state.mutate.mockReset();
  state.send.mockReset();
  state.data = {
    roles: [],
    assignments: [],
    events: [
      {
        participationId: 'p',
        state: 'assigning',
        eventId: 'e',
        title: 'Event',
        start: '2026-12-01T10:00:00Z',
        end: '2026-12-01T12:00:00Z',
        status: 'scheduled',
        fillRatio: 0,
        peopleNeeded: 2,
        assignedCount: 0,
        eventTimeBlockCount: 1,
        eventTimeBlocks: [
          {
            eventTimeBlockId: 'b',
            label: 'Block',
            startTime: '2026-12-01T10:00:00Z',
            endTime: '2026-12-01T12:00:00Z',
            included: true,
            peopleNeeded: 2,
            assignedCount: 0,
            shiftCount: 1,
            shifts: [
              {
                shiftId: 's',
                eventTimeBlockId: 'b',
                startTime: '2026-12-01T10:00:00Z',
                endTime: '2026-12-01T12:00:00Z',
                peopleNeeded: 2,
                assignedCount: 0,
                requirements: [
                  {
                    id: 'r',
                    roleId: 'role',
                    sectorName: 'Main',
                    peopleNeeded: 2,
                  },
                ],
                assignments: [],
                eligibleVolunteerCount: 0,
                eligibleVolunteers: [],
              },
            ],
          },
        ],
      },
    ],
  };
});

it('confirms whole-Schedule gaps and publishes from the Schedule page', () => {
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  fireEvent.click(screen.getByRole('button', { name: m.builder_ui_publish() }));
  expect(
    screen.getByText(m.builder_ui_publish_gaps({ places: 2, shifts: 1 })),
  ).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: m.builder_ui_publish(),
    }),
  );
  expect(state.mutate).toHaveBeenCalledWith(true);
});

it('removes Publish after the Schedule is published', () => {
  if (!state.data) throw new Error('missing fixture');
  const event = state.data.events[0];
  if (!event) throw new Error('missing event');
  event.state = 'published';
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  expect(
    screen.queryByRole('button', { name: m.builder_ui_publish() }),
  ).not.toBeInTheDocument();
});

it('sends pending changes from a published Schedule', () => {
  if (!state.data?.events[0]) throw new Error('missing fixture');
  state.data.events[0].state = 'published';
  state.data.affectedVolunteerCount = 2;
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  fireEvent.click(
    screen.getByRole('button', { name: m.builder_send_updates({ count: 2 }) }),
  );
  expect(state.send).toHaveBeenCalledOnce();
});
