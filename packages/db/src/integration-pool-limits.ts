/**
 * Fail-fast limits for integration-test pools, so a stalled test fails with a
 * named wait instead of Vitest's anonymous 30s timeout. Each sits under that
 * budget and far above healthy runs. The lock limit is below the statement
 * limit, so a lock wait reports as one.
 */
export const INTEGRATION_POOL_LIMITS = {
  /** Also bounds waiting for a free client of a full pool. */
  connectionTimeoutMillis: 20_000,
  // biome-ignore lint/style/useNamingConvention: node-postgres' config key
  lock_timeout: 15_000,
  // biome-ignore lint/style/useNamingConvention: node-postgres' config key
  statement_timeout: 25_000,
} as const;
