import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { DatabasePurpose } from '../../packages/db/src/database-target-resolver';
// Not the @church/time index: worktree bootstrap loads this module before
// `bun install`, so only its dependency-free files may be imported.
import { millisecondsBetween } from '../../packages/time/src/arithmetic';
import type { Instant } from '../../packages/time/src/brands';
import { fromDate } from '../../packages/time/src/persistence';
import type { ExecutionPurpose } from '../env/run-with-purpose';
import {
  WORKTREE_DATABASE_PURPOSES,
  worktreeDatabaseUrls,
} from '../worktree/database-targets';
import {
  type CwdInput,
  readGeneratedPorts,
  readGeneratedWorktreeIdentity,
  type WorktreeContext,
  worktreeContext,
} from '../worktree/local-env';
import type { PortSet } from '../worktree/port-allocation';
import { knownSecretsOf, sanitize } from './sanitize';

/**
 * The diagnostic bundle a failed managed command leaves behind (ADR-0005):
 * one directory holding allowlisted metadata (`bundle.json`) and bounded,
 * sanitized output (`output.log`, see ./sanitize.ts). It never copies value
 * files or the process environment.
 */

const BUNDLES_DIR_NAME = 'church-failure-bundles';
/** Where bundles go instead of the shared Git directory (tests, CI). */
export const BUNDLES_DIR_VARIABLE = 'CHURCH_FAILURE_BUNDLES_DIR';
const BUNDLE_METADATA_FILE = 'bundle.json';
const BUNDLE_OUTPUT_FILE = 'output.log';
// The head shows what started; the tail holds the error and its stack.
const HEAD_LINES = 100;
const TAIL_LINES = 300;
const MAX_LINE_LENGTH = 1000;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// `20260929T120002Z-…`: only such entries are ever pruned, so a bundle
// directory override can never delete anything else.
const BUNDLE_NAME = /^\d{8}T\d{6}Z-/;

export interface FailureRecord {
  /** The managed command, e.g. `worktree:bootstrap`. */
  command: string;
  /** The failed step within it, when it has steps. */
  step: string | null;
  commandLine: string[];
  purpose: ExecutionPurpose | null;
  startedAt: Instant;
  finishedAt: Instant;
  exitStatus: number;
  signal: NodeJS.Signals | null;
  output: string;
}

export interface RecordFailureBundleInput {
  cwd: string;
  bundlesDir: string;
  record: FailureRecord;
}

interface DatabaseTargetSummary {
  purpose: DatabasePurpose;
  host: string;
  port: number;
  database: string;
}

interface WorktreeSummary {
  worktree: string | null;
  worktreePath: string | null;
  commit: string | null;
  ports: PortSet | null;
  databaseTargets: DatabaseTargetSummary[];
}

function contextOf(input: CwdInput): WorktreeContext | undefined {
  try {
    return worktreeContext(input);
  } catch {
    return undefined;
  }
}

function commitOf(input: CwdInput): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: input.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function identityOf(input: CwdInput): string | null {
  try {
    return readGeneratedWorktreeIdentity(input) ?? null;
  } catch {
    return null;
  }
}

interface WorktreeInput {
  worktree: string;
}

/** Host, port, and database name only: never credentials or parameters. */
function databaseTargetsOf(input: WorktreeInput): DatabaseTargetSummary[] {
  const urls = worktreeDatabaseUrls(input);

  return WORKTREE_DATABASE_PURPOSES.map((purpose) => {
    const url = new URL(urls[purpose]);
    return {
      purpose,
      host: url.hostname,
      port: Number(url.port),
      database: url.pathname.slice(1),
    };
  });
}

function worktreeSummaryOf(input: CwdInput): WorktreeSummary {
  const context = contextOf(input);
  if (context === undefined) {
    return {
      worktree: null,
      worktreePath: null,
      commit: null,
      ports: null,
      databaseTargets: [],
    };
  }

  const worktree = identityOf(input);

  return {
    worktree,
    worktreePath: context.root,
    commit: commitOf(input),
    ports: readGeneratedPorts(input) ?? null,
    databaseTargets: worktree ? databaseTargetsOf({ worktree }) : [],
  };
}

/** `$CHURCH_FAILURE_BUNDLES_DIR`, else the repository's shared Git
 * directory, so bundles outlive the worktree that failed. */
export function resolveBundlesDir(input: CwdInput): string {
  const override = process.env[BUNDLES_DIR_VARIABLE];
  if (override) return override;

  const context = contextOf(input);
  if (context === undefined) {
    throw new Error(
      `${input.cwd} is not in a Git repository; set ${BUNDLES_DIR_VARIABLE} to record failure bundles here.`,
    );
  }

  return join(context.commonDir, BUNDLES_DIR_NAME);
}

interface BoundedOutput {
  text: string;
  totalLines: number;
  omittedLines: number;
}

interface TextInput {
  text: string;
}

/** The first and last lines, each capped, with the omitted count between. */
function bound(input: TextInput): BoundedOutput {
  const lines = input.text.split('\n');
  if (lines.at(-1) === '') lines.pop();

  const omittedLines = Math.max(0, lines.length - HEAD_LINES - TAIL_LINES);
  const kept =
    omittedLines === 0
      ? lines
      : [
          ...lines.slice(0, HEAD_LINES),
          `… ${omittedLines} lines omitted …`,
          ...lines.slice(-TAIL_LINES),
        ];

  return {
    text: kept.map((line) => `${line.slice(0, MAX_LINE_LENGTH)}\n`).join(''),
    totalLines: lines.length,
    omittedLines,
  };
}

interface BundleNameInput {
  record: FailureRecord;
  worktree: string | null;
}

/** `20260929T120002Z-db-bootstrap-feature_a-`: sorts by time; a random
 * suffix follows, so failures in the same second never collide. */
function bundlePrefix(input: BundleNameInput): string {
  const time = input.record.finishedAt
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(/[-:]/g, '');
  const command = input.record.command.replaceAll(/[^a-z0-9_]+/gi, '-');

  return `${time}-${command}-${input.worktree ?? 'unknown'}-`;
}

interface PruneInput {
  bundlesDir: string;
  now: Instant;
}

/** Deletes bundles last written more than 14 days before `now`. An entry
 * that vanishes or cannot be read meanwhile is skipped. */
function pruneExpiredBundles(input: PruneInput): void {
  for (const entry of readdirSync(input.bundlesDir)) {
    if (!BUNDLE_NAME.test(entry)) continue;
    const path = join(input.bundlesDir, entry);

    try {
      const stats = lstatSync(path);
      const writtenAt = fromDate({ date: stats.mtime });
      if (
        stats.isDirectory() &&
        millisecondsBetween({ start: writtenAt, end: input.now }) > RETENTION_MS
      ) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch {
      // Gone or unreadable: nothing to prune.
    }
  }
}

/** Writes one bundle for a failed command and returns its path. */
export function recordFailureBundle(input: RecordFailureBundleInput): string {
  const { record } = input;
  const summary = worktreeSummaryOf({ cwd: input.cwd });
  const secrets = knownSecretsOf({ cwd: input.cwd });
  // Sanitized before bounding, so no cut can split a secret it would match.
  const output = bound({ text: sanitize({ text: record.output, secrets }) });

  mkdirSync(input.bundlesDir, { recursive: true, mode: 0o700 });
  const path = mkdtempSync(
    join(
      input.bundlesDir,
      bundlePrefix({ record, worktree: summary.worktree }),
    ),
  );

  writeFileSync(
    join(path, BUNDLE_METADATA_FILE),
    `${JSON.stringify(
      {
        command: record.command,
        step: record.step,
        commandLine: sanitize({ text: record.commandLine.join(' '), secrets }),
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: millisecondsBetween({
          start: record.startedAt,
          end: record.finishedAt,
        }),
        exitStatus: record.exitStatus,
        signal: record.signal,
        worktree: summary.worktree,
        worktreePath: summary.worktreePath,
        commit: summary.commit,
        purpose: record.purpose,
        ports: summary.ports,
        databaseTargets: summary.databaseTargets,
        output: {
          file: BUNDLE_OUTPUT_FILE,
          totalLines: output.totalLines,
          omittedLines: output.omittedLines,
        },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(path, BUNDLE_OUTPUT_FILE), output.text, {
    mode: 0o600,
  });
  pruneExpiredBundles({ bundlesDir: input.bundlesDir, now: record.finishedAt });

  return path;
}

export interface ErrorInput {
  error: unknown;
}

export function errorMessage(input: ErrorInput): string {
  return input.error instanceof Error
    ? input.error.message
    : String(input.error);
}

export interface TryRecordFailureBundleInput {
  cwd: string;
  record: FailureRecord;
}

/** Records into the resolved bundle directory and prints the path. A
 * recording problem only warns: it never replaces the command's failure. */
export function tryRecordFailureBundle(
  input: TryRecordFailureBundleInput,
): void {
  try {
    const path = recordFailureBundle({
      cwd: input.cwd,
      bundlesDir: resolveBundlesDir({ cwd: input.cwd }),
      record: input.record,
    });
    console.error(`✖ ${input.record.command} failure bundle: ${path}`);
  } catch (error) {
    console.error(
      `⚠ ${input.record.command}: could not record a failure bundle: ${errorMessage({ error })}`,
    );
  }
}
