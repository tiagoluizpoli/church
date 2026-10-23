import { spawnSync } from 'node:child_process';

// Rewrites the working tree, so it is CI-only (see docs/agents/tooling.md).
// Must match orval's output in orval.config.ts.
const GENERATED_PATHS = [
  'apps/server/auto-generated-api.yaml',
  'apps/web/src/infrastructure/api/',
];

const generate = spawnSync('bun', ['run', 'api:generate'], {
  stdio: 'inherit',
});
if (generate.status !== 0) process.exit(generate.status ?? 1);

const gitStatus = spawnSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', ...GENERATED_PATHS],
  { encoding: 'utf8' },
);
if (gitStatus.error || gitStatus.status !== 0) {
  console.error(`git status failed:\n${gitStatus.stderr}`);
  process.exit(1);
}
const drift = gitStatus.stdout.trim();
if (drift) {
  console.error(
    `Generated API files differ from the server code:\n${drift}\n\nRun \`bun run api:generate\` and commit the result.`,
  );
  process.exit(1);
}
