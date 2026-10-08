import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * #263: `db:clean` resolves its target like `db:reset:dev` does
 * (getDevelopmentDatabaseUrl): a redacted preflight, and a refusal before
 * anything runs against another worktree's or another purpose's database. Port 9 has no listener, so an accepted target fails on
 * connect instead of touching a real database.
 */

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const WORKTREE = 'destructive_command';
const UNREACHABLE = 'postgresql://postgres:postgres@127.0.0.1:9';

interface DestructiveCommand {
  name: string;
  args: string[];
}

const COMMANDS: DestructiveCommand[] = [
  { name: 'db:clean', args: [join(SOURCE_DIR, 'scripts/clean-db.ts')] },
];

interface RunCommandInput {
  command: DestructiveCommand;
  database: string;
}

interface RunCommandResult {
  status: number | null;
  output: string;
}

function runCommand(input: RunCommandInput): RunCommandResult {
  const result = spawnSync('bun', ['--no-env-file', ...input.command.args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CHURCH_EXEC_PURPOSE: 'development',
      CHURCH_WORKTREE: WORKTREE,
      DATABASE_URL: `${UNREACHABLE}/${input.database}`,
      BETTER_AUTH_SECRET: 'destructive-command-test-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:9',
      CORS_ORIGIN: 'http://127.0.0.1:9',
      UNLEASH_API_URL: 'http://127.0.0.1:9/api',
      UNLEASH_API_TOKEN: 'token',
    },
  });

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe.each(COMMANDS)('$name', (command) => {
  it.each([
    ['another worktree', 'church_other_dev'],
    ['the integration purpose', `church_${WORKTREE}_int`],
    ['the primary development', 'church'],
  ])("refuses %s's database before touching it", (_label, database) => {
    const result = runCommand({ command, database });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      `does not match the expected "church_${WORKTREE}_dev"`,
    );
    expect(result.output).not.toContain('postgres:postgres');
  });

  it('reports the redacted development target before connecting', () => {
    const result = runCommand({ command, database: `church_${WORKTREE}_dev` });

    expect(result.output).toContain(
      `purpose=development worktree=${WORKTREE} host=127.0.0.1 port=9 database=church_${WORKTREE}_dev`,
    );
    expect(result.status).not.toBe(0);
  });
});
