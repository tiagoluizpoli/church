import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeDevDomainProblem } from './dev-hostname';

/**
 * The machine-shared values in one ignored `church-shared.env` in the shared
 * Git directory (ADR-0005): what every worktree on this machine shares, such
 * as where Unleash runs and this machine's development domain. `env:local`
 * copies them into each worktree's `.env.local`; `dns:start` configures the
 * resolver from them. Also the dotenv line format both read.
 */

export const SHARED_VALUES_FILE = 'church-shared.env';
const DEV_DOMAIN_VARIABLE = 'CHURCH_DEV_DOMAIN';

interface ContentInput {
  content: string;
}

/** `KEY=value` lines, values as written (quotes kept); comments skipped. */
export function parseValues(input: ContentInput): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of input.content.split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0 && !line.startsWith('#')) {
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }

  return values;
}

interface PathInput {
  path: string;
}

export function readContent(input: PathInput): string | undefined {
  return existsSync(input.path) ? readFileSync(input.path, 'utf8') : undefined;
}

interface RawValueInput {
  value: string | undefined;
}

/** A dotenv value without its surrounding quotes. */
export function unquoted(input: RawValueInput): string | undefined {
  return input.value?.replace(/^(['"])(.*)\1$/, '$2');
}

export interface SharedValues {
  /** The file, named in every error about its values. */
  path: string;
  /** Its values as written (quotes kept), for copying verbatim. */
  values: Map<string, string>;
}

interface CommonDirInput {
  commonDir: string;
}

export function sharedValuesPath(input: CommonDirInput): string {
  return join(input.commonDir, SHARED_VALUES_FILE);
}

/** This machine's shared values; none when the file does not exist. */
export function readSharedValues(input: CommonDirInput): SharedValues {
  const path = sharedValuesPath(input);

  return {
    path,
    values: parseValues({ content: readContent({ path }) ?? '' }),
  };
}

interface SharedValueInput {
  shared: SharedValues;
  key: string;
}

/** One shared value without its quotes; undefined when unset or empty. */
export function sharedValue(input: SharedValueInput): string | undefined {
  return unquoted({ value: input.shared.values.get(input.key) }) || undefined;
}

interface SharedInput {
  shared: SharedValues;
}

/** This machine's development domain; undefined when unset, so worktree
 * hostnames fall back to `localhost`. Refuses a malformed one. */
export function sharedDevDomain(input: SharedInput): string | undefined {
  const domain = sharedValue({ ...input, key: DEV_DOMAIN_VARIABLE });
  if (!domain) return undefined;

  const problem = describeDevDomainProblem({ domain });
  if (problem) {
    throw new Error(
      `${input.shared.path} sets ${DEV_DOMAIN_VARIABLE} to ${problem}. Fix it, then rerun.`,
    );
  }

  return domain;
}
