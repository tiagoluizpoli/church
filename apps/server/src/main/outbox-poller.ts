import { trace } from '@opentelemetry/api';
import type {
  IOutboxPoller,
  OutboxPollerOptions,
} from '../domain/contracts/application/outbox-poller';
import { SERVICE_NAME } from '../infrastructure/services/otel-tracing';

const tracer = trace.getTracer(SERVICE_NAME);

/**
 * The runtime host for the outbox drain worker — an in-process interval,
 * one of the two implementation choices spec §6.4 explicitly leaves open.
 * Skips a tick already in flight rather than overlapping it, so a slow
 * drain (many due messages, a sluggish EmailSender) never piles up
 * concurrent ticks against the same table.
 */
export class OutboxPoller implements IOutboxPoller {
  private timer: ReturnType<typeof setInterval> | undefined;
  private isDraining = false;
  private inFlight: Promise<void> | undefined;

  constructor(private readonly options: OutboxPollerOptions) {}

  start(): void {
    this.timer = setInterval(() => {
      // One span per tick, so the drain's SQL nests under it in the trace.
      void tracer.startActiveSpan('outbox.tick', (span) => {
        const run = this.tick().finally(() => span.end());
        this.inFlight = run;
        return run;
      });
    }, this.options.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
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
