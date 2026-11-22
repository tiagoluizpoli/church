import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  findReusablePass,
  readCleanTree,
  recordPass,
} from '../../validation/gate-pass';

let repo: string;
let dir: string;

const git = (...args: string[]) => {
  const { exitCode, stderr } = Bun.spawnSync(['git', ...args], { cwd: repo });
  if (exitCode !== 0) throw new Error(stderr.toString());
};

const commitFile = ({ content }: { content: string }) => {
  writeFileSync(join(repo, 'file.txt'), content);
  git('add', 'file.txt');
  git('commit', '-q', '-m', 'change');
};

/** Records a pass of the given tier for the tree checked out right now. */
const pass = ({ tier }: { tier: 'affected' | 'no-docker' | 'validate' }) => {
  const tree = readCleanTree({ cwd: repo });
  if (!tree) throw new Error('expected a clean tree');
  recordPass({ cwd: repo, dir, tier, tree });
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'gate-pass-repo-'));
  dir = mkdtempSync(join(tmpdir(), 'gate-pass-state-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  commitFile({ content: 'one' });
});
afterEach(() => {
  rmSync(repo, { force: true, recursive: true });
  rmSync(dir, { force: true, recursive: true });
});

describe('gate pass reuse', () => {
  it('reuses an affected pass for an equal or weaker gate on the same tree', () => {
    pass({ tier: 'affected' });

    expect(findReusablePass({ cwd: repo, dir, tier: 'no-docker' })?.tier).toBe(
      'affected',
    );
    expect(findReusablePass({ cwd: repo, dir, tier: 'affected' })?.tier).toBe(
      'affected',
    );
    expect(findReusablePass({ cwd: repo, dir, tier: 'validate' })).toBeNull();
  });

  it('does not reuse a weaker pass for a stronger gate', () => {
    pass({ tier: 'no-docker' });

    expect(findReusablePass({ cwd: repo, dir, tier: 'affected' })).toBeNull();
  });

  it('keeps the stronger pass when a weaker gate passes the same tree later', () => {
    pass({ tier: 'validate' });
    pass({ tier: 'no-docker' });

    expect(findReusablePass({ cwd: repo, dir, tier: 'affected' })?.tier).toBe(
      'validate',
    );
  });

  it('validates again after an uncommitted edit', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'file.txt'), 'edited');

    expect(readCleanTree({ cwd: repo })).toBeNull();
    expect(findReusablePass({ cwd: repo, dir, tier: 'no-docker' })).toBeNull();
  });

  it('validates again with an untracked file present', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'new.txt'), 'new');

    expect(findReusablePass({ cwd: repo, dir, tier: 'no-docker' })).toBeNull();
  });

  it('validates again after an amend changes the tree', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'file.txt'), 'amended');
    git('commit', '-q', '-a', '--amend', '--no-edit');

    expect(findReusablePass({ cwd: repo, dir, tier: 'no-docker' })).toBeNull();
  });

  it('records nothing when the tree changed while the gate ran', () => {
    const tree = readCleanTree({ cwd: repo });
    if (!tree) throw new Error('expected a clean tree');
    commitFile({ content: 'two' });
    recordPass({ cwd: repo, dir, tier: 'affected', tree });

    expect(findReusablePass({ cwd: repo, dir, tier: 'no-docker' })).toBeNull();
  });
});
