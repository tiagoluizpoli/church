import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT_PATH = join(
  REPO_ROOT,
  'tooling/validation/presentation-text-guard.ts',
);

let workDir: string;

function writeSource({ path, source }: { path: string; source: string }) {
  const fullPath = join(workDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source);
}

function runGuard(paths: string[]) {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, ...paths], {
    cwd: workDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

describe('presentation text guard command', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'presentation-text-guard-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('exits nonzero with every located diagnostic when a file holds copy', () => {
    writeSource({
      path: 'apps/web/src/components/ui/dialog.tsx',
      source: `export const Close = () => (
  <button aria-label="Close">
    <span className="sr-only">Close</span>
  </button>
);
`,
    });

    const { exitCode, stderr } = runGuard([
      'apps/web/src/components/ui/dialog.tsx',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr.trim().split('\n')).toEqual([
      'apps/web/src/components/ui/dialog.tsx:2:22: attribute "aria-label" "Close": use a catalog message (m.*) or pass translated content',
      'apps/web/src/components/ui/dialog.tsx:3:31: JSX text "Close": use a catalog message (m.*) or pass translated content',
    ]);
  });

  it('exits zero and prints nothing for catalog-backed source', () => {
    writeSource({
      path: 'apps/web/src/components/ui/dialog.tsx',
      source: `import { m } from '@church/i18n/messages';
export const Close = () => (
  <button aria-label={m.common_close()} className="size-4" />
);
`,
    });

    const { exitCode, stderr } = runGuard([
      'apps/web/src/components/ui/dialog.tsx',
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
  });
});
