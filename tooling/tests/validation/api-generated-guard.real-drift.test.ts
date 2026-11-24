import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';

/**
 * Proves the guard against the real generator (#953): a disposable worktree of
 * HEAD with this checkout's dependencies linked in, so regeneration never
 * touches this working tree. Each test starts from HEAD again.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const CONTROLLER =
  'apps/server/src/api/controllers/public-church-profile-controller.ts';
const SUMMARY = 'Get a Public Church Profile';
const WEB_CLIENT = 'apps/web/src/infrastructure/api/public-church-profile.ts';
const STRAY = 'apps/web/src/infrastructure/api/removed-tag.ts';
const GENERATION_TIMEOUT_MS = 180_000;

let worktree: string;
let base: string;

function git(args: string[], cwd = worktree) {
  const result = Bun.spawnSync(['git', ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function commitAll(message: string) {
  git(['add', '-A']);
  git([
    '-c',
    'user.email=t@e.st',
    '-c',
    'user.name=T',
    'commit',
    '--no-verify',
    '-qm',
    message,
  ]);
}

function runGuard() {
  const result = Bun.spawnSync(
    [process.execPath, 'tooling/validation/api-generated-guard.ts'],
    { cwd: worktree, stderr: 'pipe', stdout: 'pipe' },
  );
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

beforeAll(() => {
  worktree = mkdtempSync(join(tmpdir(), 'api-guard-real-'));
  git(['worktree', 'add', '--detach', worktree, 'HEAD'], REPO_ROOT);
  base = git(['rev-parse', 'HEAD']);
  const workspaceDeps = new Bun.Glob('{apps,packages}/*/node_modules').scanSync(
    { cwd: REPO_ROOT, onlyFiles: false },
  );
  for (const path of ['node_modules', '.env.local', ...workspaceDeps]) {
    // A workspace HEAD no longer has (an untracked leftover here) gets no link.
    if (
      existsSync(join(REPO_ROOT, path)) &&
      existsSync(dirname(join(worktree, path)))
    )
      symlinkSync(join(REPO_ROOT, path), join(worktree, path));
  }
});

beforeEach(() => {
  // Ignored files (the dependency links, .env.local) survive the reset.
  git(['reset', '--hard', '-q', base]);
  git(['clean', '-fdq']);
});

afterAll(() => {
  git(['worktree', 'remove', '--force', worktree], REPO_ROOT);
  rmSync(worktree, { force: true, recursive: true });
});

describe('api-generated-guard against the real generator', () => {
  it(
    'fails on a changed route schema, then passes once the client is regenerated',
    () => {
      const controller = join(worktree, CONTROLLER);
      const original = readFileSync(controller, 'utf8');
      expect(original).toContain(SUMMARY);
      writeFileSync(
        controller,
        original.replace(SUMMARY, `${SUMMARY} (drift)`),
      );

      const drifted = runGuard();
      expect(drifted.exitCode).toBe(1);
      expect(drifted.stderr).toContain('Generated API files differ');
      expect(drifted.stderr).toContain('apps/server/auto-generated-api.yaml');
      expect(drifted.stderr).toContain(WEB_CLIENT);

      // The developer's fix: commit the regenerated output the failed run left.
      commitAll('regen');
      expect(runGuard().exitCode).toBe(0);
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    'fails on a committed client file the server no longer generates',
    () => {
      writeFileSync(join(worktree, STRAY), 'export {};\n');
      commitAll('stray');

      const { exitCode, stderr } = runGuard();
      expect(exitCode).toBe(1);
      expect(stderr).toContain(STRAY);
    },
    GENERATION_TIMEOUT_MS,
  );
});
