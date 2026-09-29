import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  parseReseedArguments,
  ReseedArgumentError,
  ReseedPhaseError,
  type ReseedPhases,
  resolveReseedAnchor,
  runReseedPhases,
} from '../../seeds/development/reseed';

describe('parseReseedArguments', () => {
  it('leaves the anchor to the Church Timezone default when none is given', () => {
    expect(parseReseedArguments({ argv: [] })).toEqual({ anchor: undefined });
  });

  it('accepts an explicit --anchor day', () => {
    expect(parseReseedArguments({ argv: ['--anchor=2026-03-15'] })).toEqual({
      anchor: '2026-03-15',
    });
  });

  it.each([
    ['a day that does not exist', '--anchor=2026-02-30'],
    ['a non-ISO day', '--anchor=15/03/2026'],
    ['a timestamp', '--anchor=2026-03-15T10:00'],
    ['an empty value', '--anchor='],
  ])('refuses %s', (_label, argument) => {
    expect(() => parseReseedArguments({ argv: [argument] })).toThrow(
      ReseedArgumentError,
    );
  });

  it.each([
    ['an unknown flag', ['--scenario=big']],
    ['a bare --anchor with no value', ['--anchor', '2026-03-15']],
    ['a repeated anchor', ['--anchor=2026-03-15', '--anchor=2026-03-16']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseReseedArguments({ argv })).toThrow(ReseedArgumentError);
  });
});

describe('resolveReseedAnchor', () => {
  it('keeps an explicit anchor', () => {
    expect(
      resolveReseedAnchor({
        anchor: parseReseedArguments({ argv: ['--anchor=2026-03-15'] }).anchor,
        instant: parseInstant({ value: '2026-09-29T12:00:00.000Z' }),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('2026-03-15');
  });

  it("defaults to today's day in the Church Timezone, not UTC", () => {
    // 01:30 UTC on the 30th is still 22:30 on the 29th in São Paulo.
    expect(
      resolveReseedAnchor({
        anchor: undefined,
        instant: parseInstant({ value: '2026-09-30T01:30:00.000Z' }),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('2026-09-29');
  });
});

interface RecordedRun {
  calls: string[];
  lines: string[];
}

interface FakePhasesInput {
  failAt?: string;
}

interface FakePhases {
  phases: ReseedPhases<string>;
  run: RecordedRun;
}

interface FakeStepInput {
  name: string;
}

/** Phases that record their order and throw at `failAt`. */
function fakePhases({ failAt }: FakePhasesInput): FakePhases {
  const run: RecordedRun = { calls: [], lines: [] };
  const step = async ({ name }: FakeStepInput): Promise<void> => {
    run.calls.push(name);
    if (name === failAt) throw new Error(`${name} broke`);
  };

  return {
    run,
    phases: {
      reset: () => step({ name: 'reset' }),
      migrate: () => step({ name: 'migrate' }),
      load: async () => {
        await step({ name: 'load' });
        return 'graph';
      },
      verify: ({ seeded }) => step({ name: `verify:${seeded}` }),
    },
  };
}

describe('runReseedPhases', () => {
  it('resets, migrates, loads, then verifies the loaded graph, reporting each phase', async () => {
    const { phases, run } = fakePhases({});

    const seeded = await runReseedPhases({
      phases,
      report: ({ message }) => run.lines.push(message),
    });

    expect(seeded).toBe('graph');
    expect(run.calls).toEqual(['reset', 'migrate', 'load', 'verify:graph']);
    expect(run.lines).toEqual([
      '[1/4] reset: ok',
      '[2/4] migrate: ok',
      '[3/4] load: ok',
      '[4/4] verify: ok',
    ]);
  });

  it.each([
    ['reset', ['reset']],
    ['migrate', ['reset', 'migrate']],
    ['load', ['reset', 'migrate', 'load']],
    ['verify:graph', ['reset', 'migrate', 'load', 'verify:graph']],
  ])('stops at a failing %s phase and names it', async (failAt, calls) => {
    const { phases, run } = fakePhases({ failAt });

    const failure = await runReseedPhases({
      phases,
      report: ({ message }) => run.lines.push(message),
    }).catch((error: unknown) => error);

    const phase = failAt.split(':')[0];
    expect(failure).toBeInstanceOf(ReseedPhaseError);
    expect(failure).toMatchObject({
      phase,
      message: expect.stringContaining(`${failAt} broke`),
    });
    expect(run.calls).toEqual(calls);
    expect(run.lines).not.toContain(`[${calls.length}/4] ${phase}: ok`);
  });
});
