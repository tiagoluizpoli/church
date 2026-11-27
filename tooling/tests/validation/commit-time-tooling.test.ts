import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real `commit-msg` command from `lefthook.yml`, and pins which
 * lint scripts only read and which ones fix.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
/** Real commitlint takes over 5 s to start on a loaded machine. */
const COMMITLINT_TIMEOUT_MS = 60_000;
const FAIL_FAST_MS = 5000;

interface LefthookJob {
  name?: string;
  run: string;
  glob?: string | string[];
}

interface LefthookConfig {
  'pre-commit': { jobs: LefthookJob[] };
  'pre-push': { jobs: LefthookJob[] };
  'commit-msg': { commands: { commitlint: LefthookJob } };
}

const lefthook = Bun.YAML.parse(
  readFileSync(join(REPO_ROOT, 'lefthook.yml'), 'utf8'),
) as LefthookConfig;
const { scripts } = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'commit-tooling-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface CommitMsgInput {
  message: string;
  cwd: string;
  timeout?: number;
}

function runCommitMsg(input: CommitMsgInput) {
  const messageFile = join(sandbox, 'COMMIT_EDITMSG');
  writeFileSync(messageFile, `${input.message}\n`);
  const command = lefthook['commit-msg'].commands.commitlint.run.replaceAll(
    '{1}',
    messageFile,
  );
  const result = spawnSync('sh', ['-c', command], {
    cwd: input.cwd,
    encoding: 'utf8',
    timeout: input.timeout ?? COMMITLINT_TIMEOUT_MS,
  });

  return { status: result.status, output: result.stdout + result.stderr };
}

describe('commit-msg hook', () => {
  it(
    'accepts a conventional message',
    () => {
      const result = runCommitMsg({
        message: 'chore(root): tidy the hooks',
        cwd: REPO_ROOT,
      });

      expect(result.status).toBe(0);
    },
    COMMITLINT_TIMEOUT_MS,
  );

  it(
    'refuses an unknown type, naming the rule',
    () => {
      const result = runCommitMsg({
        message: 'wip(root): tidy the hooks',
        cwd: REPO_ROOT,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('type-enum');
    },
    COMMITLINT_TIMEOUT_MS,
  );

  it('fails at once without node_modules, naming the bootstrap', () => {
    const result = runCommitMsg({
      message: 'chore(root): tidy the hooks',
      cwd: sandbox,
      timeout: FAIL_FAST_MS,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('run `bun run worktree:bootstrap`');
  });
});

describe('pre-commit checks', () => {
  const jobs = new Map(
    lefthook['pre-commit'].jobs.map((job) => [job.name, job]),
  );

  // Type errors are caught at pre-push (validate:no-docker runs typecheck), keeping commits fast.
  it('leaves type checking to pre-push', () => {
    expect(jobs.has('typecheck')).toBe(false);
    expect(lefthook['pre-push'].jobs.map((job) => job.run)).toEqual([
      'bun run validate:no-docker',
    ]);
  });

  it('refuses unformatted CSS without rewriting it, naming the fix', () => {
    expect(Object.entries(jobs.get('css') ?? {})).toEqual([
      ['name', 'css'],
      ['glob', '*.css'],
      ['run', 'bun run lint:files -- {staged_files}'],
      [
        'fail_text',
        'Unformatted or invalid CSS: run `bun run lint:fix`, then stage the result.',
      ],
    ]);
  });

  it('checks spec registration when a spec or either list is staged', () => {
    expect(jobs.get('spec-registration')).toEqual({
      name: 'spec-registration',
      glob: [
        'apps/web/tests/**.spec.ts',
        'apps/web/tests/fixtures/e2e-lanes.ts',
        'tooling/validation/journey-map.ts',
      ],
      run: 'bun run validate:e2e-lanes && bun run validate:journey-map',
    });
  });
});

describe('lint scripts', () => {
  it('lint only reads', () => {
    expect(scripts['lint:files']).toBe(
      'biome check --no-errors-on-unmatched --files-ignore-unknown=true',
    );
    expect(scripts.lint).toStartWith('bun run lint:files -- . && ');
    expect(scripts.lint).not.toContain('lint:fix');
    expect(scripts.lint).not.toContain('--write');
  });

  it('lint runs the read-only check, then each guard', () => {
    expect(scripts.lint?.split(' && ')).toEqual([
      'bun run lint:files -- .',
      'bun run validate:test-placement',
      'bun run validate:i18n-parity',
      'bun run validate:named-parameters',
      'bun run validate:server-types',
      'bun run validate:journey-map',
      'bun run validate:e2e-lanes',
      'bun run validate:presentation-text',
      'bun run validate:date-time-seam',
      'bun run validate:constitution-version',
    ]);
  });

  it('keeps the fixing Biome job to script and JSON files', () => {
    const [biome] = lefthook['pre-commit'].jobs;
    expect(biome.glob).toBe('*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}');
  });

  it('lint:fix and the pre-commit Biome job fix', () => {
    expect(scripts['lint:fix:files']).toContain('biome check --write ');
    const [biome] = lefthook['pre-commit'].jobs;
    expect(biome.run).toBe('bun run lint:fix:files -- {staged_files}');
    expect(Object.entries(biome)).toContainEqual(['stage_fixed', true]);
  });
});
