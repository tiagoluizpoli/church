import { execFileSync } from 'node:child_process';

export type ExecutionPurpose = 'development' | 'unit' | 'integration' | 'e2e';

export interface RunWithPurposeInput {
  /**
   * Directory containing the service's `.env.schema`. Varlock only
   * discovers sibling `.env` / `.env.<purpose>` overlays when `--path`
   * names that directory, not the schema file itself.
   */
  schemaDir: string;
  purpose: ExecutionPurpose;
  command: string[];
}

/**
 * Runs `command` through the Varlock CLI with `CHURCH_EXEC_PURPOSE` set
 * explicitly (ADR-0005: purpose selection is never derived from `NODE_ENV`
 * and has no fallback). Varlock resolves, validates, and redacts the
 * service's schema before injecting it into the child process; a missing or
 * invalid required value fails the command instead of running it.
 */
export function runWithPurpose(input: RunWithPurposeInput): void {
  execFileSync(
    'varlock',
    ['run', '--path', input.schemaDir, '--', ...input.command],
    {
      env: { ...process.env, CHURCH_EXEC_PURPOSE: input.purpose },
      stdio: 'inherit',
    },
  );
}
