import {
  type ExecFileSyncOptionsWithStringEncoding,
  execFileSync,
} from 'node:child_process';
import { readSeedImpactTrailers } from './seed-impact';

/**
 * Which commit supplied each `Seed-Impact` trailer, and whether it is one of
 * the branch's own: above the open PR's base or, without a PR, above the
 * validate base. CI sees only those once a lower stacked PR merges (#1164).
 */

export interface CommitAcknowledgement {
  reason: string;
  sha: string;
}

export interface SeedAcknowledgements {
  accepted: CommitAcknowledgement[];
  /** Trailers from commits below the branch's own. */
  borrowed: CommitAcknowledgement[];
  /** The ref the branch's own commits sit above. */
  ownBaseRef: string | undefined;
}

const QUIET: ExecFileSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
};
const GH_TIMEOUT_MS = 10_000;

// shortcut: any `gh` failure (offline, not signed in) reads as "no PR"; the
// plan prints the base it used. Tell them apart if that ever hides a borrow.
function readOpenPullRequestBase(): string | undefined {
  try {
    const output = execFileSync(
      'gh',
      ['pr', 'view', '--json', 'baseRefName,state'],
      { ...QUIET, timeout: GH_TIMEOUT_MS },
    );
    const { baseRefName, state } = JSON.parse(output);
    return state === 'OPEN' ? String(baseRefName) : undefined;
  } catch {
    return undefined;
  }
}

function isRef({ ref }: { ref: string }): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], QUIET);
    return true;
  } catch {
    return false;
  }
}

/** The remote-tracking ref first: it is what the PR is compared against. */
function resolvePullRequestBase({ name }: { name: string }): string {
  const ref = [`origin/${name}`, name].find((candidate) =>
    isRef({ ref: candidate }),
  );
  if (ref === undefined) {
    throw new Error(
      `The open PR's base "${name}" is not available locally; run git fetch origin ${name}.`,
    );
  }
  return ref;
}

function readTrailers({ baseRef }: { baseRef: string }) {
  const log = execFileSync(
    'git',
    ['log', '--format=%x01%h%x00%B', `${baseRef}..HEAD`],
    { encoding: 'utf8' },
  );
  return log
    .split('\x01')
    .slice(1)
    .flatMap((entry) => {
      const [sha = '', message = ''] = entry.split('\0');
      return readSeedImpactTrailers({ messages: [message] }).map(
        (reason): CommitAcknowledgement => ({ reason, sha }),
      );
    });
}

/** `baseRef` is the validate base: the range the trailers are read from. */
export function readSeedAcknowledgements({
  baseRef,
}: {
  baseRef: string | undefined;
}): SeedAcknowledgements {
  const trailers = baseRef ? readTrailers({ baseRef }) : [];
  // Nothing to attribute: don't pay for the PR lookup.
  if (!baseRef || trailers.length === 0) {
    return { accepted: [], borrowed: [], ownBaseRef: baseRef };
  }

  const name = readOpenPullRequestBase();
  const ownBaseRef = name ? resolvePullRequestBase({ name }) : baseRef;
  const ownShas = new Set(
    execFileSync('git', ['log', '--format=%h', `${ownBaseRef}..HEAD`], {
      encoding: 'utf8',
    }).split('\n'),
  );
  return {
    accepted: trailers.filter(({ sha }) => ownShas.has(sha)),
    borrowed: trailers.filter(({ sha }) => !ownShas.has(sha)),
    ownBaseRef,
  };
}
