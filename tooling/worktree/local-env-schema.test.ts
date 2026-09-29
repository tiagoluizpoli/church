import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runWithPurpose } from '../env/run-with-purpose';

/**
 * Uses the real root `.env.schema` beneath a service schema that imports it,
 * the way apps/server, apps/web and packages/db do, and a root `.env.local`
 * shaped like the one `env:local` generates: the generated values reach a
 * Varlock-wrapped child, and a malformed one stops the command instead.
 */

const ROOT_SCHEMA = resolve(import.meta.dir, '../../.env.schema');

const GENERATED_VALUES = {
  CHURCH_WORKTREE: 'feature_a',
  CHURCH_SERVER_PORT: '27520',
  CHURCH_WEB_PORT: '21187',
  PW_SERVER_PORT: '25081',
  PW_WEB_PORT: '26409',
};

let rootDir: string;
let serviceDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'church-local-env-schema-'));
  serviceDir = join(rootDir, 'service');
  mkdirSync(serviceDir);
  copyFileSync(ROOT_SCHEMA, join(rootDir, '.env.schema'));
  writeFileSync(
    join(serviceDir, '.env.schema'),
    '# @defaultSensitive=false @defaultRequired=infer\n# @import(../)\n# ---\n',
  );
  writeFileSync(
    join(rootDir, '.env.local'),
    Object.entries(GENERATED_VALUES)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

interface ForwardedValuesInput {
  env?: NodeJS.ProcessEnv;
}

function forwardedValues(input: ForwardedValuesInput): Record<string, string> {
  const outputPath = join(rootDir, 'output.json');
  const inherited = process.env;
  process.env = { ...inherited, ...input.env };

  try {
    runWithPurpose({
      schemaDir: serviceDir,
      purpose: 'development',
      command: [
        'node',
        '-e',
        `require('fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(GENERATED_VALUES))}.map((key) => [key, process.env[key]]))))`,
      ],
    });
  } finally {
    process.env = inherited;
  }

  return JSON.parse(readFileSync(outputPath, 'utf8'));
}

describe('root .env.schema', () => {
  it('forwards the generated worktree identity and ports from the root .env.local', () => {
    expect(forwardedValues({})).toEqual(GENERATED_VALUES);
  });

  it('forwards the worktree identity and ports when they arrive in the inherited environment', () => {
    rmSync(join(rootDir, '.env.local'));

    expect(forwardedValues({ env: GENERATED_VALUES })).toEqual(
      GENERATED_VALUES,
    );
  });

  it('accepts a hash-suffixed worktree identity', () => {
    const values = {
      ...GENERATED_VALUES,
      CHURCH_WORKTREE: 'feature_b__cc4d8924',
    };

    expect(forwardedValues({ env: values })).toEqual(values);
  });

  it.each([
    ['CHURCH_WORKTREE', 'Feature/A'],
    ['CHURCH_WORKTREE', 'feature__a'],
    ['CHURCH_SERVER_PORT', 'not-a-port'],
    ['CHURCH_WEB_PORT', '70000'],
  ])('refuses to run the command when %s is %s', (key, value) => {
    expect(() =>
      forwardedValues({ env: { ...GENERATED_VALUES, [key]: value } }),
    ).toThrow();
  });
});
