import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isWholeLocalRun, parseArguments } from '../../validation/affected';
import {
  findReusablePass,
  readCleanTree,
  recordPass,
} from '../../validation/gate-pass';

let repo: string;
let dir: string;
const BASE = 'merge-base-a';

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
  // validate checks everything, so it records no base.
  const base = tier === 'validate' ? undefined : BASE;
  recordPass({ base, cwd: repo, dir, tier, tree });
};

const find = ({
  base = BASE,
  tier,
}: {
  base?: string;
  tier: 'affected' | 'no-docker' | 'validate';
}) => findReusablePass({ base, cwd: repo, dir, tier });

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

    expect(find({ tier: 'no-docker' })?.tier).toBe('affected');
    expect(find({ tier: 'affected' })?.tier).toBe('affected');
    expect(find({ tier: 'validate' })).toBeNull();
  });

  it('does not reuse a weaker pass for a stronger gate', () => {
    pass({ tier: 'no-docker' });

    expect(find({ tier: 'affected' })).toBeNull();
  });

  it('keeps the stronger pass when a weaker gate passes the same tree later', () => {
    pass({ tier: 'validate' });
    pass({ tier: 'no-docker' });

    expect(find({ tier: 'affected' })?.tier).toBe('validate');
  });

  it('validates again after an uncommitted edit', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'file.txt'), 'edited');

    expect(readCleanTree({ cwd: repo })).toBeNull();
    expect(find({ tier: 'no-docker' })).toBeNull();
  });

  it('validates again with an untracked file present', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'new.txt'), 'new');

    expect(find({ tier: 'no-docker' })).toBeNull();
  });

  it('validates again after an amend changes the tree', () => {
    pass({ tier: 'affected' });
    writeFileSync(join(repo, 'file.txt'), 'amended');
    git('commit', '-q', '-a', '--amend', '--no-edit');

    expect(find({ tier: 'no-docker' })).toBeNull();
  });

  it('validates again against a different merge-base', () => {
    pass({ tier: 'affected' });

    expect(find({ base: 'merge-base-b', tier: 'no-docker' })).toBeNull();
  });

  it('reuses a validate pass whatever the merge-base', () => {
    pass({ tier: 'validate' });

    expect(find({ base: 'merge-base-b', tier: 'affected' })?.tier).toBe(
      'validate',
    );
  });

  it('validates again when the recorded pass is malformed', () => {
    const tree = readCleanTree({ cwd: repo });
    const path = join(dir, 'gate-passes', `${tree}-${BASE}.json`);
    mkdirSync(join(dir, 'gate-passes'));
    writeFileSync(path, JSON.stringify({ tier: 'affected' }));

    expect(find({ tier: 'no-docker' })).toBeNull();
  });

  it('records nothing when the tree changed while the gate ran', () => {
    const tree = readCleanTree({ cwd: repo });
    if (!tree) throw new Error('expected a clean tree');
    commitFile({ content: 'two' });
    recordPass({ base: BASE, cwd: repo, dir, tier: 'affected', tree });

    expect(find({ tier: 'no-docker' })).toBeNull();
  });
});

describe('which runs may reuse or record a pass', () => {
  const wholeRun = ({ args, ci }: { args: string[]; ci?: string }) =>
    isWholeLocalRun({ argumentsResult: parseArguments({ args }), ci });

  it('allows a plain local run of either tier', () => {
    expect(wholeRun({ args: [] })).toBe(true);
    expect(wholeRun({ args: ['--no-docker'] })).toBe(true);
  });

  it('refuses a CI run', () => {
    expect(wholeRun({ args: [], ci: 'true' })).toBe(false);
  });

  it.each([
    [['--dry-run']],
    [['--only-e2e']],
    [['--skip-e2e']],
    [['--daily-gate']],
    [['--base', 'origin/develop']],
    [['--e2e', 'tests/a.spec.ts']],
  ])('refuses a narrowed or widened run: %p', (args) => {
    expect(wholeRun({ args })).toBe(false);
  });
});
