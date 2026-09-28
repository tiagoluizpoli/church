import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from './purpose-database-url-guard';

const DEVELOPMENT_DATABASE_NAME = 'church';
const UNSPECIFIED_WORKTREE_LABEL = 'unspecified';

interface GetDatabaseNameInput {
  parsedUrl: URL;
}

function getDatabaseName(input: GetDatabaseNameInput): string {
  return input.parsedUrl.pathname.replace(/^\//, '');
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
  requireExecPurpose({
    purpose: 'integration',
    functionName: 'getIntegrationDatabaseUrl',
  });

  const databaseUrl = requireDatabaseUrl({ purpose: 'integration' });

  const parsedUrl = new URL(databaseUrl);
  const databaseName = getDatabaseName({ parsedUrl });

  if (databaseName === DEVELOPMENT_DATABASE_NAME) {
    throw new Error(
      `Refusing to run integration work against the development database "${DEVELOPMENT_DATABASE_NAME}". Point the integration purpose at a dedicated integration database.`,
    );
  }

  reportDatabaseTarget({
    identity: {
      purpose: 'integration',
      worktree: process.env.CHURCH_WORKTREE ?? UNSPECIFIED_WORKTREE_LABEL,
      host: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
      database: databaseName,
    },
  });

  return databaseUrl;
}
