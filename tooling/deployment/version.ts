import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Release version preparation (#882), run from the repository root:
 *
 *   rc <major|minor|patch>   stable X.Y.Z → next X.Y.Z-rc.1
 *   rc                       X.Y.Z-rc.N   → X.Y.Z-rc.N+1
 *   stable                   X.Y.Z-rc.N   → X.Y.Z
 *
 * It only rewrites the root package.json `version`. Committing, merging to
 * master and publishing the GitHub release (which deploys) are separate
 * operator steps; see docs/operations/releases.md.
 */

const MANIFEST = 'package.json';
const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$/;
const LEVELS = ['major', 'minor', 'patch'] as const;
type Level = (typeof LEVELS)[number];
const EXIT_USAGE = 2;

class UsageError extends Error {}

interface Version {
  major: number;
  minor: number;
  patch: number;
  rc: number | undefined;
}

interface NextInput {
  current: Version;
  command: string | undefined;
  level: string | undefined;
}

function parse(text: string): Version {
  const match = VERSION.exec(text);
  if (!match) {
    throw new UsageError(
      `package.json version "${text}" is not X.Y.Z or X.Y.Z-rc.N.`,
    );
  }
  const [, major, minor, patch, rc] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    rc: rc === undefined ? undefined : Number(rc),
  };
}

function format(version: Version): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.rc === undefined ? base : `${base}-rc.${version.rc}`;
}

function bump(current: Version, level: Level): Version {
  const { major, minor, patch } = current;
  if (level === 'major') return { major: major + 1, minor: 0, patch: 0, rc: 1 };
  if (level === 'minor') return { major, minor: minor + 1, patch: 0, rc: 1 };
  return { major, minor, patch: patch + 1, rc: 1 };
}

function next(input: NextInput): Version {
  const { current, command, level } = input;
  if (command === 'stable' && level === undefined) {
    if (current.rc === undefined) {
      throw new UsageError(
        `${format(current)} is not a release candidate; only a tested candidate becomes stable.`,
      );
    }
    return { ...current, rc: undefined };
  }
  if (command === 'rc' && current.rc !== undefined) {
    if (level !== undefined) {
      throw new UsageError(
        `${format(current)} is an open candidate: run "rc" without a level to increment it, or "stable" to finalize it first.`,
      );
    }
    return { ...current, rc: current.rc + 1 };
  }
  if (command === 'rc' && LEVELS.includes(level as Level)) {
    return bump(current, level as Level);
  }
  throw new UsageError(
    'Usage: version.ts rc <major|minor|patch>   (from a stable version)\n' +
      '       version.ts rc                        (next candidate)\n' +
      '       version.ts stable                    (finalize the candidate)',
  );
}

function main(): void {
  const [command, level, ...rest] = process.argv.slice(2);
  if (rest.length > 0) throw new UsageError('Too many arguments.');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    version?: string;
  };
  const current = parse(manifest.version ?? '0.0.0');
  const version = format(next({ current, command, level }));
  manifest.version = version;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✔ package.json version ${format(current)} → ${version}`);
  console.log(
    `Next: commit, merge to master, then publish a GitHub ${version.includes('-rc.') ? 'prerelease' : 'release'} tagged v${version} on that master commit.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? EXIT_USAGE : 1);
}
