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

interface LefthookJob {
  run: string;
}

interface LefthookConfig {
  'pre-commit': { jobs: LefthookJob[] };
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
    timeout: 5000,
  });

  return { status: result.status, output: result.stdout + result.stderr };
}

describe('commit-msg hook', () => {
  it('accepts a conventional message', () => {
    const result = runCommitMsg({
      message: 'chore(root): tidy the hooks',
      cwd: REPO_ROOT,
    });

    expect(result.status).toBe(0);
  });

  it('refuses an unknown type, naming the rule', () => {
    const result = runCommitMsg({
      message: 'wip(root): tidy the hooks',
      cwd: REPO_ROOT,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('type-enum');
  });

  it('fails at once without node_modules, naming the bootstrap', () => {
    const result = runCommitMsg({
      message: 'chore(root): tidy the hooks',
      cwd: sandbox,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('run `bun run worktree:bootstrap`');
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

  it('lint:fix and the pre-commit Biome job fix', () => {
    expect(scripts['lint:fix:files']).toContain('biome check --write ');
    const [biome] = lefthook['pre-commit'].jobs;
    expect(biome.run).toBe('bun run lint:fix:files -- {staged_files}');
    expect(Object.entries(biome)).toContainEqual(['stage_fixed', true]);
  });
});
