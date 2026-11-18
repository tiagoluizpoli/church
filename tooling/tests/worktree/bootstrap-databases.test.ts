import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * The failure paths `db:bootstrap` reports before it touches PostgreSQL;
 * creation, migration, concurrency and resume are covered against a real
 * server in packages/db/tests/provision-databases.test.ts.
 */

const BOOTSTRAP_SCRIPT = resolve(
  import.meta.dir,
  '../../worktree/bootstrap-databases.ts',
);
const LOCAL_ENV_SCRIPT = resolve(
  import.meta.dir,
  '../../worktree/local-env.ts',
);

let checkout: string;

interface RunResult {
  status: number | null;
  output: string;
}

function run(): RunResult {
  const result = spawnSync('bun', [BOOTSTRAP_SCRIPT], {
    cwd: checkout,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

beforeEach(() => {
  checkout = mkdtempSync(join(tmpdir(), 'church-db-bootstrap-'));
  execFileSync('git', ['init', '-q', '-b', 'develop', checkout]);
});

afterEach(() => {
  rmSync(checkout, { recursive: true, force: true });
});

describe('db:bootstrap', () => {
  it('asks for env:local when the worktree has no generated configuration', () => {
    const result = run();

    expect(result.status).toBe(1);
    expect(result.output).toContain('✖ db:bootstrap failed');
    expect(result.output).toContain('bun run env:local');
    expect(result.output).not.toContain('    at ');
  });

  it("refuses a primary checkout whose identity names a linked worktree's databases", () => {
    execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: checkout, stdio: 'ignore' });
    const path = join(checkout, '.env.local');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'CHURCH_WORKTREE=develop',
        'CHURCH_WORKTREE=feature_a',
      ),
    );

    const result = run();

    expect(result.status).toBe(1);
    expect(result.output).toContain('"feature_a"');
    expect(result.output).toContain('bun run env:local');
  });

  it('refuses a hand-written .env.local', () => {
    writeFileSync(join(checkout, '.env.local'), 'CHURCH_WORKTREE=develop\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.output).toContain('bun run env:local');
  });
});
