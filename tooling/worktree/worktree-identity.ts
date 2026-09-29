import { createHash } from 'node:crypto';

export const PRIMARY_WORKTREE_IDENTITY = 'develop';

// Labels a feature worktree must never claim verbatim: the primary checkout,
// and the fallback database targets use when no identity is set (CI).
const RESERVED_IDENTITIES = new Set([PRIMARY_WORKTREE_IDENTITY, 'unspecified']);

// `church_<identity>_dev` must fit PostgreSQL's 63-byte identifier limit.
const MAX_IDENTITY_LENGTH = 52;
const HASH_LENGTH = 8;
const HASH_SEPARATOR = '__';
const MAX_SLUG_LENGTH =
  MAX_IDENTITY_LENGTH - HASH_SEPARATOR.length - HASH_LENGTH;
const EMPTY_SLUG_PLACEHOLDER = 'worktree';

// Lowercase words joined by single hyphens map one-to-one onto underscores,
// so they need no disambiguating hash.
const LOSSLESS_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface DeriveWorktreeIdentityInput {
  /** The worktree's branch (or directory) name. */
  name: string;
  isPrimary: boolean;
}

interface HashOfInput {
  value: string;
}

function hashOf(input: HashOfInput): string {
  return createHash('sha256')
    .update(input.value)
    .digest('hex')
    .slice(0, HASH_LENGTH);
}

/**
 * The readable, deterministic, collision-safe identity every worktree-scoped
 * resource name derives from (ADR-0005). The primary checkout is always
 * `develop`. A plain lowercase-hyphenated name stays readable as-is; any
 * name the `[a-z0-9_]` form would alter or truncate, or that claims a
 * reserved label, gets a `__<hash>` suffix of the original name, which a
 * readable identity can never contain.
 */
export function deriveWorktreeIdentity(
  input: DeriveWorktreeIdentityInput,
): string {
  if (input.isPrimary) {
    return PRIMARY_WORKTREE_IDENTITY;
  }

  const isLossless =
    LOSSLESS_NAME.test(input.name) &&
    input.name.length <= MAX_IDENTITY_LENGTH &&
    !RESERVED_IDENTITIES.has(input.name);

  if (isLossless) {
    return input.name.replaceAll('-', '_');
  }

  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^_+|_+$/g, '') || EMPTY_SLUG_PLACEHOLDER;

  return `${slug}${HASH_SEPARATOR}${hashOf({ value: input.name })}`;
}
