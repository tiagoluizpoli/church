import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const SCRIPT = resolve(import.meta.dir, '../../ci/bun-test.ts');

// The suite under test runs in its own directory, so this repository's own
// `bun test tooling` never collects it.
const FAILING_SUITE = `import { describe, expect, it } from 'bun:test';

describe('outer', () => {
  describe('inner', () => {
    it('compares <values> & "quotes"', () => {
      expect({ a: 1 }).toEqual({ a: 2 });
    });
  });
  it('throws 50%', () => {
    throw new Error('boom');
  });
  it('passes', () => {});
});
`;

const PASSING_SUITE = `import { expect, it } from 'bun:test';

it('passes', () => {
  expect(1).toBe(1);
});
`;

const UNLOADABLE_SUITE = `throw new Error('cannot load');
`;

// Any of these puts \`bun test\` in agent mode, where it prints no annotation of its own.
const AGENT_VARIABLES = ['AGENT', 'CLAUDECODE', 'REPL_ID'];

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-bun-test-'));
  mkdirSync(join(sandbox, 'tests'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface RunInput {
  githubActions: boolean;
  suite: string;
}

function run({ githubActions, suite }: RunInput) {
  writeFileSync(join(sandbox, 'tests/sample.test.ts'), suite);
  const { GITHUB_ACTIONS: _ignored, ...env } = process.env;
  for (const name of AGENT_VARIABLES) delete env[name];
  const result = Bun.spawnSync([process.execPath, SCRIPT, 'tests'], {
    cwd: sandbox,
    env: githubActions ? { ...env, GITHUB_ACTIONS: 'true' } : env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

const annotations = (stdout: string) =>
  stdout.split('\n').filter((line) => line.startsWith('::'));

const errorAnnotations = (output: string) =>
  output.split('\n').filter((line) => line.startsWith('::error '));

describe('bun-test.ts', () => {
  it('annotates each failed test with its file, failing line and title on GitHub Actions', () => {
    const { exitCode, stdout } = run({
      githubActions: true,
      suite: FAILING_SUITE,
    });

    expect(exitCode).toBe(1);
    expect(annotations(stdout)).toEqual([
      '::error file=tests/sample.test.ts,line=6,title=tests/sample.test.ts > outer > inner > compares <values> & "quotes"::AssertionError: expect(received).toEqual(expected)%0A%0A  {%0A-   "a": 2,%0A+   "a": 1,%0A  }%0A%0A- Expected  - 1%0A+ Received  + 1%0A%0A      at tests/sample.test.ts:6:24',
      '::error file=tests/sample.test.ts,line=10,title=tests/sample.test.ts > outer > throws 50%25::Error: boom%0A      at tests/sample.test.ts:10:27',
    ]);
  });

  // `bun test` annotates failures itself too, on stderr, titled by the error's
  // first line, so a multi-line error read as a second, stray annotation.
  it('prints one annotation per failure across both streams', () => {
    const { stderr, stdout } = run({
      githubActions: true,
      suite: FAILING_SUITE,
    });

    expect(errorAnnotations(`${stdout}\n${stderr}`)).toHaveLength(2);
    expect(stderr).toContain('(fail) outer > throws 50%');
  });

  it("keeps bun's own annotation for a file its report leaves out", () => {
    const { exitCode, stderr, stdout } = run({
      githubActions: true,
      suite: UNLOADABLE_SUITE,
    });

    expect(exitCode).toBe(1);
    expect(errorAnnotations(`${stdout}\n${stderr}`)).toEqual([
      expect.stringContaining('title=error: cannot load::'),
    ]);
  });

  it('keeps bun test output and adds no annotation off GitHub Actions', () => {
    const { exitCode, stderr, stdout } = run({
      githubActions: false,
      suite: FAILING_SUITE,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('(fail) outer > throws 50%');
    expect(stderr).toContain(' 2 fail');
    expect(annotations(stdout)).toEqual([]);
  });

  it('passes with no annotation when every test passes', () => {
    const { exitCode, stdout } = run({
      githubActions: true,
      suite: PASSING_SUITE,
    });

    expect(exitCode).toBe(0);
    expect(annotations(stdout)).toEqual([]);
  });
});
