import type { IOutboxDrainer } from '../domain/contracts/application/outbox-drainer';

export interface OutboxPollerOptions {
  drainer: IOutboxDrainer;
  intervalMs: number;
  batchSize: number;
}

/**
 * The runtime host for the outbox drain worker — an in-process interval,
 * one of the two implementation choices spec §6.4 explicitly leaves open.
 * Skips a tick already in flight rather than overlapping it, so a slow
 * drain (many due messages, a sluggish EmailSender) never piles up
 * concurrent ticks against the same table.
 */
export class OutboxPoller {
  private timer: ReturnType<typeof setInterval> | undefined;
  private isDraining = false;

  constructor(private readonly options: OutboxPollerOptions) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      await this.options.drainer.drainOnce({ limit: this.options.batchSize });
    } catch (error) {
      // Never log the raw error: it may echo bound values (e.g. a Postgres
      // constraint message quoting an email address) — spec §6.6 requires
      // logs stay redacted, so only the error's type is reported here.
      const name = error instanceof Error ? error.name : 'UnknownError';
      console.error(`[OutboxPoller] drain tick failed: ${name}`);
    } finally {
      this.isDraining = false;
    }
  }
}
