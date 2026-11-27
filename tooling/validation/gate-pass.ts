import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_LOCK_DIR, type DirInput } from './validate-lock';

/** Weakest first: a pass of a later tier also covers every earlier one. */
const TIERS = ['no-docker', 'affected', 'validate'] as const;
export type GateTier = (typeof TIERS)[number];

/** Key of a run that checked the whole tree whatever its base (`validate`). */
const WHOLE_TREE = 'whole-tree';
const SHORT_COMMIT_LENGTH = 12;

export interface GatePass {
  commit: string;
  tier: GateTier;
  worktree: string;
}

interface CwdInput {
  cwd?: string;
}

export interface FindReusablePassInput extends CwdInput, DirInput {
  /** The merge-base the affected selection diffed against. */
  base: string;
  tier: GateTier;
}

export interface RecordPassInput extends CwdInput, DirInput {
  /** The merge-base the run's selection diffed against; omitted for a whole-tree run. */
  base?: string;
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

/** The tree a run judges, for its result line: HEAD's, marked when work is uncommitted. */
export function readJudgedTree({ cwd }: CwdInput): string {
  const clean = readCleanTree({ cwd });
  if (clean) return clean;
  const head = gitOutput({ args: ['rev-parse', 'HEAD^{tree}'], cwd });
  return head ? `${head}+uncommitted` : 'unknown';
}

export function readMergeBase({
  baseRef,
  cwd,
}: CwdInput & { baseRef: string }): string | null {
  return gitOutput({ args: ['merge-base', baseRef, 'HEAD'], cwd });
}

// shortcut: one small file per passed tree and base, never pruned; add pruning if the folder grows noticeably.
const passPath = ({
  base,
  dir = DEFAULT_LOCK_DIR,
  tree,
}: DirInput & { base: string; tree: string }) =>
  join(dir, 'gate-passes', `${tree}-${base}.json`);

const rank = ({ tier }: { tier: GateTier }) => TIERS.indexOf(tier);

const isGatePass = (value: unknown): value is GatePass => {
  if (typeof value !== 'object' || value === null) return false;
  const { commit, tier, worktree } = value as Record<string, unknown>;
  return (
    typeof commit === 'string' &&
    typeof worktree === 'string' &&
    TIERS.includes(tier as GateTier)
  );
};

function readPass({ path }: { path: string }): GatePass | null {
  try {
    const text = readFileSync(path, 'utf8');
    const record: unknown = JSON.parse(text);
    return isGatePass(record) ? record : null;
  } catch {
    return null; // missing or unreadable: validate as usual
  }
}

/** The recorded pass that covers `tier` for the clean current tree and base, if any. */
export function findReusablePass({
  base,
  cwd,
  dir,
  tier,
}: FindReusablePassInput): GatePass | null {
  const tree = readCleanTree({ cwd });
  if (!tree) return null;
  for (const key of [base, WHOLE_TREE]) {
    const recorded = readPass({ path: passPath({ base: key, dir, tree }) });
    if (recorded && rank(recorded) >= rank({ tier })) return recorded;
  }
  return null;
}

/** Records a passed gate for `tree`, keeping a stronger pass already recorded. */
export function recordPass({
  base = WHOLE_TREE,
  cwd,
  dir,
  tier,
  tree,
}: RecordPassInput): void {
  if (readCleanTree({ cwd }) !== tree) return;
  const path = passPath({ base, dir, tree });
  const recorded = readPass({ path });
  if (recorded && rank(recorded) >= rank({ tier })) return;
  const commit = gitOutput({ args: ['rev-parse', 'HEAD'], cwd }) ?? 'unknown';
  mkdirSync(dirname(path), { recursive: true });
  const record: GatePass = { commit, tier, worktree: cwd ?? process.cwd() };
  writeFileSync(path, JSON.stringify(record));
}

export function formatReusedPass({ pass }: { pass: GatePass }): string {
  const shortCommit = pass.commit.slice(0, SHORT_COMMIT_LENGTH);
  return `Skipping validation: this tree already passed ${pass.tier} (commit ${shortCommit} in ${pass.worktree}). Commit or edit anything to validate again.`;
}
