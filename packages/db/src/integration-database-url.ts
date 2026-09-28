import { formatDatabaseTargetPreflight } from './database-target-resolver';

const DEVELOPMENT_DATABASE_NAME = 'church';
const UNSPECIFIED_WORKTREE_LABEL = 'unspecified';

interface GetDatabaseNameInput {
  databaseUrl: string;
}

function getDatabaseName(input: GetDatabaseNameInput): string {
  return new URL(input.databaseUrl).pathname.replace(/^\//, '');
}

interface ReportIntegrationTargetInput {
  databaseUrl: string;
  databaseName: string;
}

function reportIntegrationTarget(input: ReportIntegrationTargetInput): void {
  const parsedUrl = new URL(input.databaseUrl);

  console.log(
    formatDatabaseTargetPreflight({
      identity: {
        purpose: 'integration',
        worktree: process.env.CHURCH_WORKTREE ?? UNSPECIFIED_WORKTREE_LABEL,
        host: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
        database: input.databaseName,
      },
    }),
  );
}

/**
 * Returns the integration database target Varlock injected for this process
 * (ADR-0005: integration has no fallback URL and is never derived from
 * `NODE_ENV`). Callers must run through Varlock with
 * `CHURCH_EXEC_PURPOSE=integration`; anything else fails fast.
 *
 * Every caller (packages/db, packages/auth, apps/server) resolves through
 * this one function, so the redacted preflight line it logs is directly
 * comparable across all three integration runners.
 */
export function getIntegrationDatabaseUrl(): string {
  if (process.env.CHURCH_EXEC_PURPOSE !== 'integration') {
    throw new Error(
      'getIntegrationDatabaseUrl() requires CHURCH_EXEC_PURPOSE=integration. Run this command through Varlock with the integration purpose instead of relying on a default database target.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL was not resolved for the integration purpose. Integration has no fallback or legacy alias precedence.',
    );
  }

  const databaseName = getDatabaseName({ databaseUrl });

  if (databaseName === DEVELOPMENT_DATABASE_NAME) {
    throw new Error(
      `Refusing to run integration work against the development database "${DEVELOPMENT_DATABASE_NAME}". Point the integration purpose at a dedicated integration database.`,
    );
  }

  reportIntegrationTarget({ databaseUrl, databaseName });

  return databaseUrl;
}
