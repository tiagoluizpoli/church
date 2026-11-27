import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Pre-commit type check: `tsc` in each workspace that owns a staged file, over
 * the whole workspace as it is on disk. Generated sources must already exist
 * (the route tree is tracked, Paraglide compiles on install).
 */

const root = process.cwd();
const tsc = join(root, 'node_modules/.bin/tsc');
const { workspaces } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as { workspaces: { packages: string[] } };
const workspaceGlobs = workspaces.packages.map(
  (pattern) => new Bun.Glob(pattern),
);

function workspaceOf(file: string): string | undefined {
  const path = relative(root, resolve(root, file));
  const directory = path.split(sep).slice(0, 2).join('/');
  const isWorkspace = workspaceGlobs.some((glob) => glob.match(directory));
  const hasTsconfig = existsSync(join(root, directory, 'tsconfig.json'));

  return isWorkspace && hasTsconfig ? directory : undefined;
}

const touched = new Set(
  process.argv.slice(2).flatMap((file) => workspaceOf(file) ?? []),
);

if (touched.size > 0 && !existsSync(tsc)) {
  console.error(
    'Dependencies are missing here: run `bun run worktree:bootstrap`.',
  );
  process.exit(1);
}

for (const workspace of [...touched].sort()) {
  console.log(`Type check: ${workspace}`);
  // Incremental: a cold web or server check takes over 40 s, a warm one 10 s.
  const { status } = spawnSync(
    tsc,
    [
      '--noEmit',
      '--incremental',
      '--tsBuildInfoFile',
      'node_modules/.cache/pre-commit.tsbuildinfo',
    ],
    { cwd: join(root, workspace), stdio: 'inherit' },
  );
  if (status !== 0) {
    console.error(
      `Type errors in ${workspace}: fix them, then stage the result.`,
    );
    process.exitCode = 1;
  }
}
