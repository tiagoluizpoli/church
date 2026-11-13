import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real prune script with a stand-in rclone over a local directory,
 * so every pool's objects, and every read, list or delete failure, is
 * controlled.
 */

const SCRIPT = resolve(import.meta.dir, '../../deployment/prune-backups.sh');
const STAND_IN = resolve(import.meta.dir, 'stand-in-rclone.sh');
const POOL = 'backups/church-postgres/production/scheduled';

let root: string;
let bin: string;

beforeEach(() => {
  const sandbox = mkdtempSync(join(tmpdir(), 'prune-backups-'));
  root = join(sandbox, 'remote');
  bin = join(sandbox, 'bin');
  mkdirSync(bin);
  copyFileSync(STAND_IN, join(bin, 'rclone'));
  chmodSync(join(bin, 'rclone'), 0o755);
});

afterEach(() => {
  rmSync(join(root, '..'), { recursive: true, force: true });
});

// Dokploy's timestamped name for backup number `day`.
function backupName(day: number): string {
  return `2026-11-${String(day).padStart(2, '0')}T03-00-00-000Z.sql.gz`;
}

interface PoolInput {
  pool?: string;
  intact: number[];
  incomplete?: number[];
}

// A failed upload whose cleanup also failed leaves a truncated gzip stream.
function seedPool({ pool = POOL, intact, incomplete = [] }: PoolInput): void {
  mkdirSync(join(root, pool), { recursive: true });
  for (const day of intact) {
    const dump = Bun.gzipSync(
      `pg_dump custom archive ${day} ${'x'.repeat(4096)}`,
    );
    writeFileSync(join(root, pool, backupName(day)), dump);
  }
  for (const day of incomplete) {
    const dump = Bun.gzipSync(
      `pg_dump custom archive ${day} ${'y'.repeat(4096)}`,
    );
    writeFileSync(join(root, pool, backupName(day)), dump.slice(0, 40));
  }
}

function remaining(pool = POOL): number[] {
  return readdirSync(join(root, pool))
    .map((name) => Number(name.slice(8, 10)))
    .sort((a, b) => b - a);
}

function deletions(): string[] {
  const calls = join(root, '.calls');
  if (!existsSync(calls)) return [];
  return readFileSync(calls, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('deletefile '));
}

function prune(pools: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(
    ['sh', SCRIPT, ...pools.map((pool) => `stand-in:${pool}`)],
    {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        STAND_IN_ROOT: root,
        ...env,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe('prune-backups.sh', () => {
  it('keeps the newest five intact backups and deletes older ones', () => {
    seedPool({ intact: [1, 2, 3, 4, 5, 6, 7] });

    const result = prune([POOL]);

    expect(result.exitCode).toBe(0);
    expect(remaining()).toEqual([7, 6, 5, 4, 3]);
    expect(result.output).toContain('5 intact backup(s) kept, 2 deleted');
  });

  it('never lets a failed upload whose cleanup failed displace an intact backup', () => {
    // Native count-based retention would keep 7..3: only four intact.
    seedPool({ intact: [1, 2, 4, 5, 6, 7], incomplete: [3] });

    const result = prune([POOL]);

    expect(result.exitCode).toBe(0);
    expect(remaining()).toEqual([7, 6, 5, 4, 2]);
    expect(result.output).toContain('1 incomplete found');
  });

  it('keeps the newest object while no newer intact backup exists, as it may still be uploading', () => {
    seedPool({ intact: [1, 2, 3, 4, 5, 6], incomplete: [7] });

    const result = prune([POOL]);

    expect(result.exitCode).toBe(0);
    expect(remaining()).toEqual([7, 6, 5, 4, 3, 2]);
  });

  it('deletes no intact backup while fewer than five exist, and says so', () => {
    seedPool({ intact: [2, 4, 5], incomplete: [3] });

    const result = prune([POOL]);

    expect(result.exitCode).toBe(0);
    expect(remaining()).toEqual([5, 4, 2]);
    expect(result.output).toContain('only 3 intact backup(s)');
  });

  it('deletes nothing in a pool it cannot fully read', () => {
    seedPool({ intact: [1, 2, 3, 4, 5, 6, 7], incomplete: [8] });

    const result = prune([POOL], { STAND_IN_UNREADABLE: backupName(2) });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`could not read ${backupName(2)}`);
    expect(deletions()).toEqual([]);
    expect(remaining()).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('deletes nothing in a pool it cannot list', () => {
    seedPool({ intact: [1, 2, 3, 4, 5, 6, 7] });

    const result = prune([POOL], { STAND_IN_UNLISTABLE: '1' });

    expect(result.exitCode).toBe(1);
    expect(deletions()).toEqual([]);
  });

  it('fails when a delete fails, keeping the rest of its decisions', () => {
    seedPool({ intact: [1, 2, 3, 4, 5, 6, 7] });

    const result = prune([POOL], { STAND_IN_UNDELETABLE: backupName(1) });

    expect(result.exitCode).toBe(1);
    expect(remaining()).toEqual([7, 6, 5, 4, 3, 1]);
  });

  it('prunes each pool on its own and ignores other files', () => {
    const other = 'backups/church-postgres/production/pre-deployment';
    seedPool({ intact: [1, 2, 3, 4, 5, 6] });
    seedPool({ pool: other, intact: [1, 2, 3] });
    writeFileSync(join(root, POOL, 'notes.txt'), 'operator notes');

    const result = prune([POOL, other]);

    expect(result.exitCode).toBe(0);
    expect(readdirSync(join(root, POOL))).toContain('notes.txt');
    expect(remaining(other)).toEqual([3, 2, 1]);
    expect(deletions()).toEqual([`deletefile ${backupName(1)}`]);
  });

  it('refuses to run without a pool', () => {
    expect(prune([]).exitCode).toBe(2);
  });
});
