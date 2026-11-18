import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'bun:test';

// Run by git-env-isolation.test.ts under inherited Git configuration: writes a
// temp repository and linked worktree the way tooling tests do.
it.each([
  ['default options', {}],
  ['an explicit env: undefined', { env: undefined }],
])('runs git in a temp dir with %s', (_, options) => {
  const dir = mkdtempSync(join(tmpdir(), 'git-env-fixture-'));
  try {
    for (const args of [
      ['init', '--quiet', '-b', 'main'],
      ['config', 'user.email', 'fixture@example.com'],
      ['config', 'user.name', 'Fixture'],
      ['commit', '--quiet', '--allow-empty', '-m', 'fixture'],
    ]) {
      const result = Bun.spawnSync(['git', ...args], {
        ...options,
        cwd: dir,
        stderr: 'pipe',
      });
      expect(result.exitCode).toBe(0);
    }

    const worktree = join(dir, 'feature');
    const result = Bun.spawnSync(
      ['git', 'worktree', 'add', '--quiet', '-b', 'feature', worktree],
      { ...options, cwd: dir, stderr: 'pipe' },
    );
    expect(result.exitCode).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
