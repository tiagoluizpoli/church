import { resolve } from 'node:path';
import { runManaged } from '../diagnostics/run-managed';

/**
 * `bun run worktree:bootstrap`: makes a worktree ready to run (ADR-0005).
 * The checked-in Worktrunk `pre-start` hook runs it for every new worktree
 * before any launched task; the primary checkout runs the same command
 * explicitly. Every step is rerunnable, so recovering from a failure is
 * fixing its cause and rerunning the whole command. A failed step leaves a
 * diagnostic bundle naming it in the shared Git directory, so it outlives
 * a worktree removed after the failure.
 */

const REPO_ROOT = resolve(import.meta.dir, '../..');

interface BootstrapStep {
  name: string;
  command: string[];
}

const BOOTSTRAP_STEPS: BootstrapStep[] = [
  { name: 'dependencies', command: ['bun', 'install', '--frozen-lockfile'] },
  // Starts or verifies the shared services from the primary checkout's
  // Compose file, never this worktree's copy, and waits until healthy.
  { name: 'postgres', command: ['bun', 'run', 'db:start'] },
  { name: 'configuration', command: ['bun', 'run', 'env:local'] },
  { name: 'databases', command: ['bun', 'run', 'db:bootstrap'] },
];

interface StepInput {
  step: BootstrapStep;
}

async function runStep(input: StepInput): Promise<boolean> {
  console.log(
    `▸ worktree:bootstrap ${input.step.name}: ${input.step.command.join(' ')}`,
  );

  return (
    (await runManaged({
      command: 'worktree:bootstrap',
      step: input.step.name,
      argv: input.step.command,
      cwd: REPO_ROOT,
    })) === 0
  );
}

async function main(): Promise<void> {
  for (const step of BOOTSTRAP_STEPS) {
    if (!(await runStep({ step }))) {
      console.error(
        `✖ worktree:bootstrap failed at "${step.name}". Earlier steps are kept; fix the cause above, then rerun \`bun run worktree:bootstrap\` in this worktree.`,
      );
      process.exit(1);
    }
  }

  console.log('✓ worktree:bootstrap ready');
}

if (import.meta.main) {
  await main();
}
