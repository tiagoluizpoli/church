import { createHash } from 'node:crypto';

const POSTGRES_IDENTIFIER_LIMIT = 63;
const PURPOSE_HASH_LENGTH = 8;
const MINIMUM_PURPOSE_HASH_LENGTH = 4;
const READABLE_PURPOSE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export interface ScratchDatabaseNameInput {
  purpose: string;
  kind: 'dev' | 'int' | 'e2e';
}

/** Scratch databases are worktree-prefixed so pruning keeps live suites;
 * purpose hashes keep long names within PostgreSQL's 63-byte limit. */
export function scratchDatabaseName(input: ScratchDatabaseNameInput): string {
  const worktree = process.env.CHURCH_WORKTREE;
  if (!worktree || !/^[a-z0-9_]+$/.test(worktree)) {
    throw new Error(
      'CHURCH_WORKTREE must declare a worktree identity using lowercase letters, digits and underscores; run `bun run env:local`.',
    );
  }
  const prefix = `church_${worktree}_`;
  const suffix = `_${input.kind}`;
  const purposeBudget =
    POSTGRES_IDENTIFIER_LIMIT - prefix.length - suffix.length;
  let purpose = input.purpose;
  if (!READABLE_PURPOSE.test(purpose) || purpose.length > purposeBudget) {
    if (purposeBudget < MINIMUM_PURPOSE_HASH_LENGTH) {
      throw new Error(
        "Scratch database name exceeds PostgreSQL's 63-byte limit; the worktree identity leaves insufficient room for the purpose and kind.",
      );
    }
    const purposeHashLength = Math.min(PURPOSE_HASH_LENGTH, purposeBudget);
    const hash = createHash('sha256')
      .update(purpose)
      .digest('hex')
      .slice(0, purposeHashLength);
    purpose = hash;
  }
  return `${prefix}${purpose}${suffix}`;
}
