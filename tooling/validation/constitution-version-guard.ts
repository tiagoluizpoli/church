import {
  type ExecFileSyncOptionsWithStringEncoding,
  execFileSync,
} from 'node:child_process';
import { isCommit, MISSING_BASE_FIX, requireBaseCommit } from './base-commit';

const CONSTITUTION_PATH = '.specify/memory/constitution.md';
const VERSION_PATTERN = /^\*\*Version\*\*:\s*(\d+\.\d+\.\d+)/m;

const QUIET: ExecFileSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
};

export interface ConstitutionVersionCheck {
  constitutionChanged: boolean;
  versionChanged: boolean;
  baseVersion: string | null;
  headVersion: string | null;
  valid: boolean;
  failure: string | null;
}

/**
 * Read file content at a git ref. Returns null if the file doesn't exist at
 * that ref.
 */
export function getFileAtRef({
  path,
  ref,
}: {
  path: string;
  ref: string;
}): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], QUIET);
  } catch {
    return null;
  }
}

/**
 * Extract version from constitution content. Returns null if no version
 * found.
 */
export function extractVersion({
  content,
}: {
  content: string;
}): string | null {
  const match = content.match(VERSION_PATTERN);
  return match ? match[1] : null;
}

/**
 * Check if constitution amendment bumped the version. Returns check result
 * with validity and failure message.
 */
export function checkConstitutionVersionBump({
  baseRef,
}: {
  baseRef: string;
}): ConstitutionVersionCheck {
  const baseContent = getFileAtRef({ path: CONSTITUTION_PATH, ref: baseRef });
  const headContent = getFileAtRef({ path: CONSTITUTION_PATH, ref: 'HEAD' });

  // Constitution missing at HEAD is an error (guard should not pass)
  if (!headContent) {
    return {
      constitutionChanged: false,
      versionChanged: false,
      baseVersion: null,
      headVersion: null,
      valid: false,
      failure: `${CONSTITUTION_PATH}: file missing at HEAD`,
    };
  }

  // Constitution missing at base (new file) is valid
  if (!baseContent) {
    return {
      constitutionChanged: false,
      versionChanged: false,
      baseVersion: null,
      headVersion: extractVersion({ content: headContent }),
      valid: true,
      failure: null,
    };
  }

  const baseVersion = extractVersion({ content: baseContent });
  const headVersion = extractVersion({ content: headContent });

  const constitutionChanged = baseContent !== headContent;
  const versionChanged = baseVersion !== headVersion;

  if (constitutionChanged && !versionChanged) {
    return {
      constitutionChanged,
      versionChanged,
      baseVersion,
      headVersion,
      valid: false,
      failure: `${CONSTITUTION_PATH}: constitution amended without version bump (version ${headVersion ?? 'missing'} unchanged from base)`,
    };
  }

  return {
    constitutionChanged,
    versionChanged,
    baseVersion,
    headVersion,
    valid: true,
    failure: null,
  };
}

/**
 * The base to compare with: `--base`, else the branch's configured validate
 * base (never silently replaced), else `origin/$GITHUB_BASE_REF` in CI, else
 * develop. Each must be a commit this clone has: a missing base fails closed.
 */
function readValidateBase(): string | undefined {
  const branch = execFileSync(
    'git',
    ['branch', '--show-current'],
    QUIET,
  ).trim();
  if (branch) {
    const configured = readGitConfig({
      key: `branch.${branch}.validateBase`,
    });
    if (configured) return configured;
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) return `origin/${githubBaseRef}`;

  return ['origin/develop', 'develop'].find((ref) => isCommit({ ref }));
}

function readGitConfig({ key }: { key: string }): string | undefined {
  try {
    return execFileSync('git', ['config', '--get', key], QUIET).trim();
  } catch {
    return undefined;
  }
}

function readBaseRef(): string {
  const baseRefIndex = process.argv.indexOf('--base');
  if (baseRefIndex !== -1) {
    const baseRefArg = process.argv[baseRefIndex + 1];
    if (!baseRefArg) throw new Error('--base needs a ref');
    return baseRefArg;
  }
  const baseRef = readValidateBase();
  if (!baseRef) {
    throw new Error(
      `No base ref found: set branch.*.validateBase or pass --base, or ${MISSING_BASE_FIX}.`,
    );
  }
  return baseRef;
}

if (import.meta.main) {
  try {
    const baseRef = readBaseRef();
    requireBaseCommit({ ref: baseRef });
    const result = checkConstitutionVersionBump({ baseRef });
    if (!result.valid && result.failure) {
      console.error(result.failure);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
