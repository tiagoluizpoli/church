import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real shared-compose wrapper from a primary checkout and from a
 * linked worktree, with `docker` replaced on PATH by a recorder.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SHARED_COMPOSE = resolve(REPO_ROOT, 'tooling/worktree/shared-compose.sh');

let sandbox: string;
let primary: string;
let feature: string;
let log: string;

interface GitInput {
  cwd: string;
  args: string[];
}

function git(input: GitInput): void {
  execFileSync('git', input.args, { cwd: input.cwd, stdio: 'ignore' });
}

interface RunInput {
  cwd: string;
  args: string[];
}

function run(input: RunInput): string {
  const result = spawnSync('sh', [SHARED_COMPOSE, ...input.args], {
    cwd: input.cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${sandbox}:${process.env.PATH}` },
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return readFileSync(log, 'utf8').trim();
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'church-compose-')));
  primary = join(sandbox, 'church');
  feature = join(sandbox, 'church.feature');
  log = join(sandbox, 'docker.log');

  writeFileSync(join(sandbox, 'docker'), `#!/bin/sh\necho "$*" > "${log}"\n`);
  chmodSync(join(sandbox, 'docker'), 0o755);

  execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
  git({
    cwd: primary,
    args: [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    ],
  });
  git({
    cwd: primary,
    args: ['worktree', 'add', '-q', '-b', 'feature', feature],
  });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('shared-compose', () => {
  it("drives the primary checkout's compose file from a linked worktree", () => {
    expect(run({ cwd: feature, args: ['up', '--detach'] })).toBe(
      `compose --file ${primary}/docker-compose.yml up --detach`,
    );
  });

  it('drives the same file from the primary checkout and its subdirectories', () => {
    mkdirSync(join(primary, 'packages/db'), { recursive: true });

    expect(run({ cwd: join(primary, 'packages/db'), args: ['stop'] })).toBe(
      `compose --file ${primary}/docker-compose.yml stop`,
    );
  });
});
