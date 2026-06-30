const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5444/church_test';

function normalizeDatabaseUrl(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.password = decodeURIComponent(parsedUrl.password);
  return parsedUrl.toString();
}

function getDatabaseName(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  return parsedUrl.pathname.replace(/^\//, '');
}

export function getTestDatabaseUrl(): string {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL_TEST ??
    DEFAULT_TEST_DATABASE_URL;
  const primaryDatabaseUrl = process.env.DATABASE_URL;

  if (primaryDatabaseUrl) {
    const normalizedPrimaryUrl = normalizeDatabaseUrl(primaryDatabaseUrl);
    const normalizedTestUrl = normalizeDatabaseUrl(testDatabaseUrl);

    if (normalizedPrimaryUrl === normalizedTestUrl) {
      throw new Error(
        'Refusing to run tests against DATABASE_URL. Set TEST_DATABASE_URL or DATABASE_URL_TEST to a dedicated test database.',
      );
    }
  }

  if (getDatabaseName(testDatabaseUrl) === 'church') {
    throw new Error(
      'Refusing to run tests against database "church". Set TEST_DATABASE_URL or DATABASE_URL_TEST to a dedicated test database such as "church_test".',
    );
  }

  return testDatabaseUrl;
}
