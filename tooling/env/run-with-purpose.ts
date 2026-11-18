import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const EXECUTION_PURPOSES = [
  'development',
  'unit',
  'integration',
  'e2e',
] as const;

export type ExecutionPurpose = (typeof EXECUTION_PURPOSES)[number];

/**
 * The repository's Varlock CLI. Spawned by path, not by name: only
 * `bun run` puts node_modules/.bin on PATH, so a raw `bun test <file>` or
 * `bun <script>` would not find a bare `varlock`.
 */
export const VARLOCK_EXECUTABLE = resolve(
  import.meta.dir,
  '../../node_modules/.bin/varlock',
);

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
    VARLOCK_EXECUTABLE,
    ['run', '--path', input.schemaDir, '--', ...input.command],
    {
      env: { ...process.env, CHURCH_EXEC_PURPOSE: input.purpose },
      stdio: 'inherit',
    },
  );
}
