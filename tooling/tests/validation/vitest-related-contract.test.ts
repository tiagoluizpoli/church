import { expect, it } from 'bun:test';
import { needsWholeSuite } from '../../validation/vitest-related';

const CORE_PACKAGE_DIRECTORY = new URL(
  '../../../packages/core/',
  import.meta.url,
).pathname;

it('detects the installed Vitest output for a path no test imports', async () => {
  const related = Bun.spawn(
    ['bunx', 'vitest', 'related', '--run', 'src/no-test-imports-this.ts'],
    { cwd: CORE_PACKAGE_DIRECTORY, stderr: 'pipe', stdout: 'pipe' },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(related.stdout).text(),
    new Response(related.stderr).text(),
    related.exited,
  ]);

  expect(needsWholeSuite({ exitCode, output: stdout + stderr })).toBe(true);
});
