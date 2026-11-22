import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCK_DIR } from './validate-lock';

/** Weakest first: a pass of a later tier also covers every earlier one. */
const TIERS = ['no-docker', 'affected', 'validate'] as const;
export type GateTier = (typeof TIERS)[number];

export interface GatePass {
  commit: string;
  tier: GateTier;
  worktree: string;
}

interface CwdInput {
  cwd?: string;
}

interface DirInput {
  dir?: string;
}

export interface FindReusablePassInput extends CwdInput, DirInput {
  tier: GateTier;
}

export interface RecordPassInput extends CwdInput, DirInput {
  tier: GateTier;
  /** The tree read before the gate ran; a different tree now records nothing. */
  tree: string;
}

const gitOutput = ({ args, cwd }: CwdInput & { args: string[] }) => {
  const { exitCode, stdout } = Bun.spawnSync(['git', ...args], { cwd });
  return exitCode === 0 ? stdout.toString().trim() : null;
};

/** HEAD's tree hash, or null when anything is uncommitted (untracked files included). */
export function readCleanTree({ cwd }: CwdInput): string | null {
  const status = gitOutput({ args: ['status', '--porcelain'], cwd });
  if (status !== '') return null;
  return gitOutput({ args: ['rev-parse', 'HEAD^{tree}'], cwd });
}

// shortcut: one small file per passed tree, never pruned; add pruning if the folder grows noticeably.
const passPath = ({
  dir = DEFAULT_LOCK_DIR,
  tree,
}: DirInput & { tree: string }) => join(dir, 'gate-passes', `${tree}.json`);

const rank = ({ tier }: { tier: GateTier }) => TIERS.indexOf(tier);

function readPass({ path }: { path: string }): GatePass | null {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as GatePass;
    return TIERS.includes(record.tier) ? record : null;
  } catch {
    return null; // missing or unreadable: validate as usual
  }
}

/** The recorded pass that covers `tier` for the clean current tree, if any. */
export function findReusablePass({
  cwd,
  dir,
  tier,
}: FindReusablePassInput): GatePass | null {
  const tree = readCleanTree({ cwd });
  if (!tree) return null;
  const recorded = readPass({ path: passPath({ dir, tree }) });
  if (!recorded || rank(recorded) < rank({ tier })) return null;
  return recorded;
}

/** Records a passed gate for `tree`, keeping a stronger pass already recorded. */
export function recordPass({ cwd, dir, tier, tree }: RecordPassInput): void {
  if (readCleanTree({ cwd }) !== tree) return;
  const path = passPath({ dir, tree });
  const recorded = readPass({ path });
  if (recorded && rank(recorded) >= rank({ tier })) return;
  const commit = gitOutput({ args: ['rev-parse', 'HEAD'], cwd }) ?? 'unknown';
  mkdirSync(join(path, '..'), { recursive: true });
  const record: GatePass = { commit, tier, worktree: cwd ?? process.cwd() };
  writeFileSync(path, JSON.stringify(record));
}

export function formatReusedPass({ pass }: { pass: GatePass }): string {
  return `Skipping validation: this tree already passed ${pass.tier} (commit ${pass.commit.slice(0, 12)} in ${pass.worktree}). Commit or edit anything to validate again.`;
}
