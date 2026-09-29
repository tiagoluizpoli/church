import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `bun run worktree:bootstrap`: makes a worktree ready to run (ADR-0005).
 * The checked-in Worktrunk `pre-start` hook runs it for every new worktree
 * before any launched task; the primary checkout runs the same command
 * explicitly. Every step is rerunnable, so recovering from a failure is
 * fixing its cause and rerunning the whole command.
 */

const REPO_ROOT = resolve(import.meta.dir, '../..');

interface BootstrapStep {
  name: string;
  command: string[];
}

const BOOTSTRAP_STEPS: BootstrapStep[] = [
  { name: 'dependencies', command: ['bun', 'install', '--frozen-lockfile'] },
  // The fixed Compose project name makes this the one shared PostgreSQL
  // container; `--no-recreate` keeps a branch's Compose edits from replacing
  // it, and `--wait` blocks until its healthcheck passes.
  {
    name: 'postgres',
    command: [
      'docker',
      'compose',
      '--file',
      'docker-compose.yml',
      'up',
      '--detach',
      '--wait',
      '--no-recreate',
      'db',
    ],
  },
  { name: 'configuration', command: ['bun', 'run', 'env:local'] },
  { name: 'databases', command: ['bun', 'run', 'db:bootstrap'] },
];

interface StepInput {
  step: BootstrapStep;
}

function runStep(input: StepInput): boolean {
  const [program = '', ...args] = input.step.command;
  console.log(
    `▸ worktree:bootstrap ${input.step.name}: ${input.step.command.join(' ')}`,
  );
  const result = spawnSync(program, args, { cwd: REPO_ROOT, stdio: 'inherit' });

  if (result.error) {
    console.error(result.error.message);
  }

  return result.status === 0;
}

function main(): void {
  for (const step of BOOTSTRAP_STEPS) {
    if (!runStep({ step })) {
      console.error(
        `✖ worktree:bootstrap failed at "${step.name}". Earlier steps are kept; fix the cause above, then rerun \`bun run worktree:bootstrap\` in this worktree.`,
      );
      process.exit(1);
    }
  }

  console.log('✓ worktree:bootstrap ready');
}

if (import.meta.main) {
  main();
}
