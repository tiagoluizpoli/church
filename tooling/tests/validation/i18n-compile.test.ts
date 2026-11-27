import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real `@church/i18n` `compile` script with `paraglide-js`
 * replaced on PATH by a recorder.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const COMMON_ARGS =
  'compile --project ./project.inlang --strategy cookie custom-app-default-locale baseLocale --silent';
const LOCALE_MODULES = `${COMMON_ARGS} --outdir ./src/paraglide --output-structure locale-modules --emit-ts-declarations`;
const MESSAGE_MODULES = `${COMMON_ARGS} --outdir ./src/paraglide-message-modules --output-structure message-modules`;

let sandbox: string;
let packageDir: string;
let log: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'i18n-compile-'));
  packageDir = join(sandbox, 'packages/i18n');
  log = join(sandbox, 'calls.log');
  mkdirSync(packageDir, { recursive: true });
  cpSync(
    join(REPO_ROOT, 'packages/i18n/package.json'),
    join(packageDir, 'package.json'),
  );
  const tooling = join(REPO_ROOT, 'tooling/i18n');
  if (existsSync(tooling)) {
    cpSync(tooling, join(sandbox, 'tooling/i18n'), { recursive: true });
  }
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface CompileInput {
  /** How many of the first paraglide runs fail. */
  failures: number;
  error: string;
}

function compile(input: CompileInput) {
  const fake = join(sandbox, 'paraglide-js');
  writeFileSync(
    fake,
    `#!/bin/sh
echo "$*" >> "${log}"
if [ "$(wc -l < "${log}")" -le ${input.failures} ]; then
  echo "${input.error}" >&2
  exit 1
fi
`,
  );
  chmodSync(fake, 0o755);
  const result = spawnSync(process.execPath, ['run', 'compile'], {
    cwd: packageDir,
    env: { ...process.env, PATH: `${sandbox}:${process.env.PATH}` },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    output: result.stdout + result.stderr,
    calls: readFileSync(log, 'utf8').trim().split('\n'),
  };
}

describe('@church/i18n compile', () => {
  it('compiles locale modules, then message modules', () => {
    const result = compile({ failures: 0, error: '' });

    expect(result.status).toBe(0);
    expect(result.calls).toEqual([LOCALE_MODULES, MESSAGE_MODULES]);
  });

  it('stops at once on any other error', () => {
    const result = compile({ failures: 1, error: 'SyntaxError: bad catalog' });

    expect(result.status).toBe(1);
    expect(result.output).toContain('SyntaxError: bad catalog');
    expect(result.calls).toEqual([LOCALE_MODULES]);
  });
});
