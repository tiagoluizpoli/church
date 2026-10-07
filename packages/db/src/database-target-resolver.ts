const PRIMARY_WORKTREE = 'develop';

export const DATABASE_PURPOSES = ['development', 'integration', 'e2e'] as const;

export type DatabasePurpose = (typeof DATABASE_PURPOSES)[number];

export type DatabaseTargetRejectionReason =
  | 'missing-target'
  | 'invalid-url'
  | 'unmanaged-target'
  | 'purpose-name-mismatch'
  | 'development-target-forbidden'
  | 'production-like-target';

export interface DatabaseTargetCandidates {
  development: string;
  integration?: string;
  e2e?: string;
}

export interface ResolveDatabaseTargetInput {
  purpose: DatabasePurpose;
  worktree: string;
  candidates: DatabaseTargetCandidates;
}

export interface DatabaseTargetIdentity {
  purpose: DatabasePurpose;
  worktree: string;
  host: string;
  port: number;
  database: string;
}

export interface DatabaseTargetErrorInput {
  reason: DatabaseTargetRejectionReason;
  message: string;
}

export interface ExpectedDatabaseNameInput {
  purpose: DatabasePurpose;
  worktree: string;
}

interface ParseDatabaseUrlInput {
  databaseUrl: string;
  purpose: DatabasePurpose;
}

interface DatabaseNameFromInput {
  parsedUrl: URL;
}

export interface FormatDatabaseTargetPreflightInput {
  identity: DatabaseTargetIdentity;
}

export class DatabaseTargetError extends Error {
  readonly reason: DatabaseTargetRejectionReason;

  constructor(input: DatabaseTargetErrorInput) {
    super(input.message);
    this.name = 'DatabaseTargetError';
    this.reason = input.reason;
  }
}

export function expectedDatabaseName(input: ExpectedDatabaseNameInput): string {
  if (input.purpose === 'development' && input.worktree === PRIMARY_WORKTREE) {
    return 'church';
  }

  const suffix =
    input.purpose === 'development'
      ? 'dev'
      : input.purpose === 'integration'
        ? 'int'
        : 'e2e';

  return `church_${input.worktree}_${suffix}`;
}

function parseDatabaseUrl(input: ParseDatabaseUrlInput): URL {
  try {
    return new URL(input.databaseUrl);
  } catch {
    throw new DatabaseTargetError({
      reason: 'invalid-url',
      message: `Database target for purpose "${input.purpose}" is not a valid URL.`,
    });
  }
}

function databaseNameFrom(input: DatabaseNameFromInput): string {
  return input.parsedUrl.pathname.replace(/^\//, '');
}

export function resolveDatabaseTarget(
  input: ResolveDatabaseTargetInput,
): DatabaseTargetIdentity {
  const targetUrl = input.candidates[input.purpose];

  if (!targetUrl) {
    throw new DatabaseTargetError({
      reason: 'missing-target',
      message: `No database target was configured for purpose "${input.purpose}". Integration and E2E targets have no fallback.`,
    });
  }

  const parsedTargetUrl = parseDatabaseUrl({
    databaseUrl: targetUrl,
    purpose: input.purpose,
  });
  const database = databaseNameFrom({ parsedUrl: parsedTargetUrl });

  if (!database.startsWith('church')) {
    throw new DatabaseTargetError({
      reason: 'unmanaged-target',
      message: `Database "${database}" is outside the managed "church" namespace and cannot be targeted for purpose "${input.purpose}".`,
    });
  }

  if (input.purpose !== 'development') {
    const parsedDevelopmentUrl = parseDatabaseUrl({
      databaseUrl: input.candidates.development,
      purpose: 'development',
    });
    const developmentDatabase = databaseNameFrom({
      parsedUrl: parsedDevelopmentUrl,
    });
    const sameHost = parsedTargetUrl.hostname === parsedDevelopmentUrl.hostname;
    const samePort = parsedTargetUrl.port === parsedDevelopmentUrl.port;
    const sameDatabase = database === developmentDatabase;

    if (sameHost && samePort && sameDatabase) {
      throw new DatabaseTargetError({
        reason: 'development-target-forbidden',
        message: `Purpose "${input.purpose}" may not target the development database "${database}".`,
      });
    }
  }

  const expectedName = expectedDatabaseName({
    purpose: input.purpose,
    worktree: input.worktree,
  });

  if (database !== expectedName) {
    throw new DatabaseTargetError({
      reason: 'purpose-name-mismatch',
      message: `Database "${database}" does not match the expected "${expectedName}" for purpose "${input.purpose}" in worktree "${input.worktree}".`,
    });
  }

  return {
    purpose: input.purpose,
    worktree: input.worktree,
    host: parsedTargetUrl.hostname,
    port: parsedTargetUrl.port ? Number(parsedTargetUrl.port) : 5432,
    database,
  };
}

export function formatDatabaseTargetPreflight(
  input: FormatDatabaseTargetPreflightInput,
): string {
  const { purpose, worktree, host, port, database } = input.identity;
  return `purpose=${purpose} worktree=${worktree} host=${host} port=${port} database=${database}`;
}
