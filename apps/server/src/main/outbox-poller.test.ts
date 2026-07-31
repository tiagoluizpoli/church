import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboxPoller } from './outbox-poller';

const drainer = { drainOnce: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  drainer.drainOnce.mockReset();
  drainer.drainOnce.mockResolvedValue({ claimed: 0, sent: 0, failed: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

interface CreatePollerOverrides {
  intervalMs?: number;
  batchSize?: number;
}

function createPoller(overrides: CreatePollerOverrides = {}) {
  return new OutboxPoller({
    drainer: drainer as never,
    intervalMs: overrides.intervalMs ?? 5000,
    batchSize: overrides.batchSize ?? 10,
  });
}

describe('OutboxPoller', () => {
  it('drains once per interval tick', async () => {
    const poller = createPoller({ intervalMs: 1000 });
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(1);
    expect(drainer.drainOnce).toHaveBeenCalledWith({ limit: 10 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('does not tick before the interval elapses', async () => {
    const poller = createPoller({ intervalMs: 5000 });
    poller.start();

    await vi.advanceTimersByTimeAsync(4999);
    expect(drainer.drainOnce).not.toHaveBeenCalled();

    poller.stop();
  });

  it('stops ticking once stopped', async () => {
    const poller = createPoller({ intervalMs: 1000 });
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(1);

    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(1);
  });

  it('skips a tick already in flight instead of overlapping it', async () => {
    let resolveDrain: () => void = () => {};
    drainer.drainOnce.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDrain = () => resolve({ claimed: 0, sent: 0, failed: 0 });
        }),
    );

    const poller = createPoller({ intervalMs: 1000 });
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(1);

    // A second interval elapses while the first drain is still pending.
    await vi.advanceTimersByTimeAsync(1000);
    expect(drainer.drainOnce).toHaveBeenCalledTimes(1);

    resolveDrain();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
  });

  it('logs and continues when a drain tick throws', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    drainer.drainOnce.mockRejectedValueOnce(new Error('boom'));

    const poller = createPoller({ intervalMs: 1000 });
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(consoleError).toHaveBeenCalledWith(
      '[OutboxPoller] drain tick failed: Error',
    );

    poller.stop();
    consoleError.mockRestore();
  });
});
