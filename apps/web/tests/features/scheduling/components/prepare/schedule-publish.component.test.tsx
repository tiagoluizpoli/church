import { m } from '@church/i18n/messages';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchedulePublish } from '@/features/scheduling/components/prepare/schedule-publish';
import type { GetSchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  publishCycle: vi.fn(),
  sendScheduleUpdates: vi.fn(),
}));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    publishCycle: state.publishCycle,
    sendScheduleUpdates: state.sendScheduleUpdates,
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.data = { ...SCHEDULE, stage: 'assigning', gapCount: 2 };
  state.publishCycle.mockResolvedValue({ published: true });
  state.sendScheduleUpdates.mockResolvedValue({});
});
it('confirms summary gaps and unanswered people before publishing the whole Schedule', async () => {
  renderWithProviders(
    <SchedulePublish ministryId="m" cycleId="c" unanswered={7} />,
  );
  fireEvent.click(screen.getByRole('button', { name: m.builder_ui_publish() }));
  expect(screen.getByText(m.prepare_publish_gaps({ count: 2 }))).toBeVisible();
  expect(
    screen.getByText(m.prepare_publish_unanswered({ count: 7 })),
  ).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: m.builder_ui_publish(),
    }),
  );
  await waitFor(() =>
    expect(state.publishCycle).toHaveBeenCalledExactlyOnceWith(
      'c',
      { confirmBelowFull: true },
      { ministryId: 'm' },
    ),
  );
});
it('makes Publish secondary while asking', () => {
  state.data = { ...SCHEDULE, stage: 'asking', gapCount: 0 };
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  expect(
    screen.getByRole('button', { name: m.builder_ui_publish() }),
  ).toHaveClass('border-border', 'bg-background');
});
it('removes Publish after publication and renders no primary without pending changes', () => {
  state.data = { ...SCHEDULE, stage: 'published', affectedVolunteerCount: 0 };
  const { container } = renderWithProviders(
    <SchedulePublish ministryId="m" cycleId="c" />,
  );
  expect(container).toBeEmptyDOMElement();
});
it('sends pending changes from a published Schedule without loading the board', async () => {
  state.data = { ...SCHEDULE, stage: 'published', affectedVolunteerCount: 2 };
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  fireEvent.click(
    screen.getByRole('button', { name: m.builder_send_updates({ count: 2 }) }),
  );
  await waitFor(() =>
    expect(state.sendScheduleUpdates).toHaveBeenCalledExactlyOnceWith('c', {
      ministryId: 'm',
    }),
  );
});
