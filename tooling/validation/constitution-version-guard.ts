import {
  type ExecFileSyncOptionsWithStringEncoding,
  execFileSync,
} from 'node:child_process';

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

  if (!baseContent || !headContent) {
    return {
      constitutionChanged: false,
      versionChanged: false,
      baseVersion: null,
      headVersion: null,
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

function isRef({ ref }: { ref: string }): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], QUIET);
    return true;
  } catch {
    return false;
  }
}

function readValidateBase(): string {
  try {
    const branch = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim();
    if (branch) {
      const validateBase = execFileSync(
        'git',
        ['config', `branch.${branch}.validateBase`],
        QUIET,
      ).trim();
      if (validateBase && isRef({ ref: validateBase })) {
        return validateBase;
      }
    }
  } catch {
    // Fall through to develop
  }
  return 'develop';
}

if (import.meta.main) {
  const baseRefIndex = process.argv.indexOf('--base');
  let baseRef: string;
  if (baseRefIndex !== -1) {
    const baseRefArg = process.argv[baseRefIndex + 1];
    if (!baseRefArg) {
      console.error('--base needs a ref');
      process.exit(1);
    }
    baseRef = baseRefArg;
  } else {
    baseRef = readValidateBase();
  }

  if (!isRef({ ref: baseRef })) {
    console.error(`base ref "${baseRef}" does not exist`);
    process.exit(1);
  }

  const result = checkConstitutionVersionBump({ baseRef });

  if (!result.valid && result.failure) {
    console.error(result.failure);
    process.exitCode = 1;
  }
}
