export interface ShutdownSteps {
  closeApp: () => Promise<void>;
  stopPoller: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string, error?: unknown) => void;
}

/** Ordered, run-once graceful shutdown: stop intake, drain the poller, free the pool. */
export function createShutdown(steps: ShutdownSteps) {
  let running: Promise<void> | undefined;
  return (signal: string): Promise<void> => {
    running ??= (async () => {
      steps.log(`[server] ${signal} received, shutting down`);
      let failed = false;
      for (const step of [
        steps.closeApp,
        steps.stopPoller,
        steps.closeDatabase,
      ]) {
        try {
          await step();
        } catch (error) {
          failed = true;
          steps.log('[server] shutdown step failed', error);
        }
      }
      steps.exit(failed ? 1 : 0);
    })();
    return running;
  };
}

/** A stray rejection is logged, not fatal: the server keeps serving. */
export function logUnhandledRejection(
  reason: unknown,
  log: ShutdownSteps['log'],
): void {
  log('[server] unhandled rejection', reason);
}
