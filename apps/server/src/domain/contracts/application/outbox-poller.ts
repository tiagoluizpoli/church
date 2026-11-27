import type { IOutboxDrainer } from './outbox-drainer';

export interface OutboxPollerOptions {
  drainer: IOutboxDrainer;
  intervalMs: number;
  batchSize: number;
}

export interface IOutboxPoller {
  start(): void;
  /** Stops scheduling and resolves once a tick already in flight has finished. */
  stop(): Promise<void>;
}
