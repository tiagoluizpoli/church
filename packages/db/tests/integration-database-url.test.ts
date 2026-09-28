import { afterEach, describe, expect, it } from 'vitest';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

const INTEGRATION_URL =
  'postgresql://postgres:postgres@localhost:5444/church_test';

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
}

describe('getIntegrationDatabaseUrl', () => {
  afterEach(() => {
    resetEnv();
  });

  it('returns DATABASE_URL when running under the integration purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'integration';
    process.env.DATABASE_URL = INTEGRATION_URL;

    expect(getIntegrationDatabaseUrl()).toBe(INTEGRATION_URL);
  });

  it('rejects a call made outside the integration purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = INTEGRATION_URL;

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=integration/,
    );
  });

  it('rejects a missing CHURCH_EXEC_PURPOSE', () => {
    process.env.DATABASE_URL = INTEGRATION_URL;

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=integration/,
    );
  });

  it('rejects a missing DATABASE_URL with no fallback', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'integration';

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /was not resolved for the integration purpose/,
    );
  });

  it('refuses the development database "church"', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'integration';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church';

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /Refusing to run integration work against the development database/,
    );
  });
});
