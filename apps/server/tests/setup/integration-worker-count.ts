// Its own module: vitest.config.ts loads it through Node, which cannot follow
// the extensionless imports of the worker setup beside it.
export const INTEGRATION_WORKER_COUNT = 2;
