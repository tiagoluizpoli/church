export interface DrainOnceInput {
  limit: number;
}

export interface DrainOnceResult {
  claimed: number;
  sent: number;
  failed: number;
}

export interface IOutboxDrainer {
  /** Claims due outbox rows and attempts delivery for each, once. */
  drainOnce(input: DrainOnceInput): Promise<DrainOnceResult>;
}
