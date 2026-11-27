import type {
  ShutdownSteps,
  UnhandledRejectionOptions,
} from './shutdown.types';
/** Ordered, run-once graceful shutdown: stop intake, drain the poller, free the pool. */
export function createShutdown(steps: ShutdownSteps) {
  let running: Promise<void> | undefined;
  return (signal: string): Promise<void> => {
    running ??= (async () => {
      steps.log({ message: `[server] ${signal} received, shutting down` });
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
          steps.log({ message: '[server] shutdown step failed', error });
        }
      }
      steps.exit(failed ? 1 : 0);
    })();
    return running;
  };
}

/** A stray rejection is logged, not fatal: the server keeps serving. */
export function logUnhandledRejection(
  options: UnhandledRejectionOptions,
): void {
  options.log({
    message: '[server] unhandled rejection',
    error: options.reason,
  });
}
