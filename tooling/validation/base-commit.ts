import {
  type ExecFileSyncOptionsWithStringEncoding,
  execFileSync,
} from 'node:child_process';

/**
 * Guards that compare HEAD with a base commit fail closed when the clone
 * lacks it (#1233): a missing base never reads as "no changes". A shallow CI
 * checkout is the usual cause, hence the fix every message names.
 */
export const MISSING_BASE_FIX =
  'fetch full history: `fetch-depth: 0` on actions/checkout, or `git fetch --unshallow origin` locally';

const QUIET: ExecFileSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
};

interface RefInput {
  cwd?: string;
  ref: string;
}

function readCommit({ cwd, ref }: RefInput): string | undefined {
  try {
    return execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      { ...QUIET, cwd },
    ).trim();
  } catch {
    return undefined;
  }
}

/** Whether `ref` names a commit this clone has (a well-formed SHA alone is not enough). */
export function isCommit({ cwd, ref }: RefInput): boolean {
  return readCommit({ cwd, ref }) !== undefined;
}

/** The base commit's SHA; throws, naming the fix, when the clone lacks it. */
export function requireBaseCommit({ cwd, ref }: RefInput): string {
  const commit = readCommit({ cwd, ref });
  if (commit === undefined) {
    throw new Error(
      `Base "${ref}" is not a commit in this clone; ${MISSING_BASE_FIX}.`,
    );
  }
  return commit;
}

/** The merge base of `ref` and HEAD; throws, naming the fix, when there is none. */
export function requireMergeBase({ cwd, ref }: RefInput): string {
  requireBaseCommit({ cwd, ref });
  try {
    return execFileSync('git', ['merge-base', ref, 'HEAD'], {
      ...QUIET,
      cwd,
    }).trim();
  } catch {
    throw new Error(
      `Base "${ref}" shares no history with HEAD in this clone (shallow?); ${MISSING_BASE_FIX}.`,
    );
  }
}
