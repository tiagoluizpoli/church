import type {
  DatabasePurpose,
  DatabaseTargetIdentity,
} from './database-target-resolver';
import { formatDatabaseTargetPreflight } from './database-target-resolver';

const PURPOSE_LABELS: Record<DatabasePurpose, string> = {
  development: 'Development',
  integration: 'Integration',
  e2e: 'E2E',
};

export interface RequireExecPurposeInput {
  purpose: DatabasePurpose;
  functionName: string;
}

/** Shared by every purpose-scoped database-URL getter (ADR-0005): fails fast
 * when the caller didn't run through Varlock with the matching purpose. */
export function requireExecPurpose(input: RequireExecPurposeInput): void {
  if (process.env.CHURCH_EXEC_PURPOSE !== input.purpose) {
    throw new Error(
      `${input.functionName}() requires CHURCH_EXEC_PURPOSE=${input.purpose}. Run this command through Varlock with the ${input.purpose} purpose instead of relying on a default database target.`,
    );
  }
}

export interface RequireDatabaseUrlInput {
  purpose: DatabasePurpose;
}

/** Shared by every purpose-scoped database-URL getter: DATABASE_URL has no
 * fallback for integration or e2e (ADR-0005). */
export function requireDatabaseUrl(input: RequireDatabaseUrlInput): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      `DATABASE_URL was not resolved for the ${input.purpose} purpose. ${PURPOSE_LABELS[input.purpose]} has no fallback or legacy alias precedence.`,
    );
  }

  return databaseUrl;
}

export interface ReportDatabaseTargetInput {
  identity: DatabaseTargetIdentity;
}

/** Shared preflight logger: every purpose-scoped getter reports the same
 * credential-free target fingerprint before returning its URL. */
export function reportDatabaseTarget(input: ReportDatabaseTargetInput): void {
  console.log(formatDatabaseTargetPreflight({ identity: input.identity }));
}
