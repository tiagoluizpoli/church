import { spawnSync } from 'node:child_process';

// Rewrites the working tree, so it is CI-only (see docs/agents/tooling.md).
const GENERATED_PATHS = [
  'apps/server/auto-generated-api.yaml',
  'apps/web/src/infrastructure/api/',
];

const generate = spawnSync('bun', ['run', 'api:generate'], {
  stdio: 'inherit',
});
if (generate.status !== 0) process.exit(generate.status ?? 1);

const status = spawnSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', ...GENERATED_PATHS],
  { encoding: 'utf8' },
);
const drift = status.stdout.trim();
if (status.status !== 0 || drift) {
  console.error(
    `Generated API files differ from the server code:\n${drift}\n\nRun \`bun run api:generate\` and commit the result.`,
  );
  process.exit(1);
}
