import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleSendAction } from '@/features/scheduling/components/planning-admin/cycle-send-dialog';
import { renderWithProviders } from '@/tests/setup/render';

const getCycleSendSummary = vi.fn();
const sendCycle = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getCycleSendSummary: (...args: unknown[]) => getCycleSendSummary(...args),
    sendCycle: (...args: unknown[]) => sendCycle(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface ConflictInput {
  error: string;
  message: string;
  invalidEvents?: { id: string; title: string }[];
}

function conflict(data: ConflictInput) {
  return new AxiosError('Conflict', '409', undefined, undefined, {
    status: 409,
    data,
  } as AxiosResponse);
}

interface RenderInput {
  eventCount?: number;
}

function render({ eventCount = 3 }: RenderInput = {}) {
  return renderWithProviders(
    <CycleSendAction
      cycleId="cycle-1"
      cycleName="Outubro"
      eventCount={eventCount}
    />,
  );
}

async function openConfirmation() {
  const user = userEvent.setup();
  render();
  await user.click(screen.getByRole('button', { name: m.cycle_review_send() }));
  return user;
}

beforeEach(() => {
  getCycleSendSummary.mockReset();
  sendCycle.mockReset();
  getCycleSendSummary.mockResolvedValue({
    eventCount: 3,
    prefilledMinistryCount: 1,
  });
});

describe('Send to Ministries confirmation', () => {
  it('disables Send on an empty Draft and says why', () => {
    render({ eventCount: 0 });

    const button = screen.getByRole('button', { name: m.cycle_review_send() });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(m.error_empty_cycle());
  });

  it('explains the irreversible handoff with the Event and pre-filled Ministry counts', async () => {
    await openConfirmation();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      m.cycle_send_title({ cycleName: 'Outubro' }),
    );
    expect(dialog).toHaveTextContent(m.cycle_send_irreversible());
    expect(
      await screen.findByText(m.cycle_send_events_other({ count: 3 })),
    ).toBeVisible();
    expect(screen.getByText(m.cycle_send_prefill_one())).toBeVisible();
    expect(getCycleSendSummary).toHaveBeenCalledWith('cycle-1');
  });

  it('does nothing when dismissed', async () => {
    const user = await openConfirmation();

    await user.click(
      await screen.findByRole('button', { name: m.cycle_send_cancel() }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(sendCycle).not.toHaveBeenCalled();
  });

  it('submits once while pending, then reports success and closes', async () => {
    let finish: () => void = () => {};
    sendCycle.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openConfirmation();
    const confirm = await screen.findByTestId('confirm-cycle-send-button');

    await user.click(confirm);
    await user.click(confirm);

    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent(m.cycle_review_sending());
    expect(sendCycle).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith(m.cycle_send_success());
  });

  it('keeps the confirmation after a failure so the admin can retry', async () => {
    sendCycle.mockRejectedValueOnce(new Error('network'));
    sendCycle.mockResolvedValueOnce(undefined);
    const user = await openConfirmation();
    const confirm = await screen.findByTestId('confirm-cycle-send-button');

    await user.click(confirm);

    expect(await screen.findByTestId('cycle-send-error')).toHaveTextContent(
      m.cycle_send_failed(),
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(sendCycle).toHaveBeenCalledTimes(2);
  });

  it('refreshes the authoritative state on a refusal and names the Events to repair', async () => {
    const message = m.error_invalid_cycle_events();
    sendCycle.mockRejectedValue(
      conflict({
        error: 'INVALID_CYCLE_EVENTS',
        message,
        invalidEvents: [{ id: 'event-9', title: 'Retiro antigo' }],
      }),
    );
    const user = await openConfirmation();

    await user.click(await screen.findByTestId('confirm-cycle-send-button'));

    const error = await screen.findByTestId('cycle-send-error');
    expect(error).toHaveTextContent(message);
    expect(error).toHaveTextContent('Retiro antigo');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await waitFor(() => expect(getCycleSendSummary).toHaveBeenCalledTimes(2));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows a refused summary, such as an already-Sent Cycle, from the server', async () => {
    const message = m.error_illegal_state_transition();
    getCycleSendSummary.mockRejectedValue(
      conflict({ error: 'ILLEGAL_STATE_TRANSITION', message }),
    );

    await openConfirmation();

    expect(await screen.findByTestId('cycle-send-error')).toHaveTextContent(
      message,
    );
  });
});
