import { describe, expect, it } from 'bun:test';

const SELECTED = ['@church/db', '@church/auth', 'server'];

describe('turbo test:integration task graph', () => {
  it('has no dependency edge between the selected integration packages, so --concurrency overlaps them', () => {
    const result = Bun.spawnSync({
      cmd: [
        'bunx',
        'turbo',
        'test:integration',
        ...SELECTED.flatMap((name) => ['--filter', name]),
        '--only',
        '--dry=json',
      ],
      stderr: 'ignore',
    });
    const { tasks } = JSON.parse(result.stdout.toString()) as {
      tasks: { dependencies: string[]; taskId: string }[];
    };

    expect(tasks.map(({ taskId }) => taskId).sort()).toEqual(
      SELECTED.map((name) => `${name}#test:integration`).sort(),
    );
    expect(tasks.flatMap(({ dependencies }) => dependencies)).toEqual([]);
  });
});
