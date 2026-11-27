export interface OutboxRetryPolicy {
  maxAttempts: number;
  backoffCapMinutes: number;
}

export interface HasExhaustedRetriesInput {
  attempts: number;
  policy: OutboxRetryPolicy;
}

export interface NextRetryAtInput {
  attempts: number;
  policy: OutboxRetryPolicy;
}
