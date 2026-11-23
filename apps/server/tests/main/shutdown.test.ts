import { describe, expect, it, vi } from 'vitest';
import { createShutdown, logUnhandledRejection } from '@/main/shutdown';

function setup(overrides: { close?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const exit = vi.fn();
  const log = vi.fn();
  const shutdown = createShutdown({
    closeApp: overrides.close ?? (async () => void calls.push('app')),
    stopPoller: async () => void calls.push('poller'),
    closeDatabase: async () => void calls.push('db'),
    exit,
    log,
  });
  return { calls, exit, log, shutdown };
}

describe('createShutdown', () => {
  it('closes the app, stops the poller, then closes the database, and exits 0', async () => {
    const { calls, exit, shutdown } = setup();
    await shutdown('SIGTERM');
    expect(calls).toEqual(['app', 'poller', 'db']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('runs once when signalled twice', async () => {
    const { calls, shutdown } = setup();
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(calls).toEqual(['app', 'poller', 'db']);
  });

  it('still releases the pool and exits 1 when a step fails', async () => {
    const { calls, exit, log, shutdown } = setup({
      close: async () => {
        throw new Error('boom');
      },
    });
    await shutdown('SIGINT');
    expect(calls).toEqual(['poller', 'db']);
    expect(log).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('logUnhandledRejection', () => {
  it('logs the rejection without exiting', () => {
    const log = vi.fn();
    logUnhandledRejection(new Error('late'), log);
    expect(log).toHaveBeenCalledWith(
      '[server] unhandled rejection',
      expect.any(Error),
    );
  });
});
