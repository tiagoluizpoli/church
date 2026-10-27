import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureIntegrationWorkerDatabase,
  INTEGRATION_WORKER_COUNT,
  integrationWorkerDatabaseName,
} from './integration-database-worker';

const BASE_URL = 'postgresql://u:p@127.0.0.1:5432/church_wt__abc_int';

describe('integration worker databases', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs on two workers', () => {
    expect(INTEGRATION_WORKER_COUNT).toBe(2);
  });

  it('gives every worker its own database', () => {
    const names = Array.from({ length: INTEGRATION_WORKER_COUNT }, (_, index) =>
      integrationWorkerDatabaseName({ workerId: index + 1 }),
    );

    expect(new Set(names).size).toBe(INTEGRATION_WORKER_COUNT);
  });

  it.each([1, 2])('points worker %i at its own database', (workerId) => {
    vi.stubEnv('VITEST_POOL_ID', String(workerId));
    vi.stubEnv('DATABASE_URL', BASE_URL);

    configureIntegrationWorkerDatabase();

    expect(new URL(process.env.DATABASE_URL ?? '').pathname).toBe(
      `/${integrationWorkerDatabaseName({ workerId })}`,
    );
  });

  it('refuses a worker whose database was never cloned', () => {
    vi.stubEnv('VITEST_POOL_ID', String(INTEGRATION_WORKER_COUNT + 1));
    vi.stubEnv('DATABASE_URL', BASE_URL);

    expect(() => configureIntegrationWorkerDatabase()).toThrow(
      /no cloned database/,
    );
  });
});
