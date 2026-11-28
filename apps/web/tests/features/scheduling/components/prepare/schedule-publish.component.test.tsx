import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
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
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
  expect(
    screen.getByText(m.prepare_publish_gaps_other({ count: 2 })),
  ).toBeVisible();
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

function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: m.builder_ui_publish() }));
  return screen.getByRole('dialog');
}
function confirmPublish() {
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: m.builder_ui_publish(),
    }),
  );
}
it('publishes a full Schedule unconfirmed, refreshes it and closes', async () => {
  state.data = { ...SCHEDULE, stage: 'assigning', gapCount: 0 };
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />, {
    queryClient,
  });
  const dialog = openConfirmation();
  expect(within(dialog).getByText(m.builder_ui_publish_full())).toBeVisible();
  confirmPublish();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(state.publishCycle).toHaveBeenCalledExactlyOnceWith(
    'c',
    { confirmBelowFull: false },
    { ministryId: 'm' },
  );
  expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
    ['prepare-schedules'],
    ['cycle-builder', 'c', 'm'],
    ['prepare-cycle-participation', 'm', 'c'],
  ]);
  expect(toast.success).toHaveBeenCalledExactlyOnceWith(
    m.builder_logic_cycle_published(),
  );
});
it('keeps the confirmation open and reports a failed publish', async () => {
  state.publishCycle.mockRejectedValue(new Error('boom'));
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  openConfirmation();
  confirmPublish();
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      m.common_publish_failed(),
    ),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(toast.success).not.toHaveBeenCalled();
});
it('publishes nothing when the confirmation is cancelled', async () => {
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  fireEvent.click(
    within(openConfirmation()).getByRole('button', {
      name: m.builder_ui_cancel(),
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(state.publishCycle).not.toHaveBeenCalled();
});
it('asks to confirm with the server gap count when publish is refused', async () => {
  // The summary skips started Shifts, so it can read full while the server does not.
  state.data = { ...SCHEDULE, stage: 'assigning', gapCount: 0 };
  state.publishCycle.mockResolvedValueOnce({ published: false, gapCount: 2 });
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  openConfirmation();
  confirmPublish();
  expect(
    await screen.findByText(m.prepare_publish_gaps_other({ count: 2 })),
  ).toBeVisible();
  expect(toast.warning).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  confirmPublish();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(state.publishCycle).toHaveBeenCalledTimes(2);
  expect(state.publishCycle).toHaveBeenLastCalledWith(
    'c',
    { confirmBelowFull: true },
    { ministryId: 'm' },
  );
  expect(toast.success).toHaveBeenCalledOnce();
});
it('forgets the refusal when the leader cancels the confirmation', async () => {
  state.data = { ...SCHEDULE, stage: 'assigning', gapCount: 0 };
  state.publishCycle.mockResolvedValue({ published: false, gapCount: 2 });
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  openConfirmation();
  confirmPublish();
  await screen.findByText(m.prepare_publish_gaps_other({ count: 2 }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: m.builder_ui_cancel(),
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(
    within(openConfirmation()).getByText(m.builder_ui_publish_full()),
  ).toBeVisible();
  expect(state.publishCycle).toHaveBeenCalledOnce();
});
it('words one open place in the singular', () => {
  state.data = { ...SCHEDULE, stage: 'assigning', gapCount: 1 };
  renderWithProviders(<SchedulePublish ministryId="m" cycleId="c" />);
  expect(
    within(openConfirmation()).getByText(
      m.prepare_publish_gaps_one({ count: 1 }),
    ),
  ).toBeVisible();
  expect(m.prepare_publish_gaps_one({ count: 1 }, { locale: 'en' })).toBe(
    '1 place still needs people. Publish anyway?',
  );
  expect(m.prepare_publish_gaps_one({ count: 1 }, { locale: 'pt-BR' })).toBe(
    '1 vaga ainda precisa de pessoas. Publicar mesmo assim?',
  );
});
