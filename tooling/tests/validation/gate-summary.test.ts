import { describe, expect, it } from 'bun:test';
import { countTests, formatGateEnding } from '../../validation/gate-summary';

const silent = { stderr: () => {}, stdout: () => {} };

describe('formatGateEnding', () => {
  it('ends with the stage table, the result naming the tree, then the exit code', () => {
    const ending = formatGateEnding({
      counts: {
        'test:e2e': { 'did not run': 3, failed: 1, flaky: 2, passed: 9 },
        'test:unit': { passed: 193 },
      },
      exitCode: 1,
      journeyFallbacks: ['apps/web/src/a.ts', 'apps/web/src/b.ts'],
      seedDecision: 'acknowledged',
      timings: [
        { label: 'lint', ms: 1234 },
        { label: 'integration', ms: 0, skipped: true },
        { label: 'test:unit', ms: 40_100 },
        { failed: true, label: 'test:e2e (affected journeys)', ms: 5000 },
      ],
      tree: 'abc123',
    });

    expect(ending).toBe(
      [
        '',
        'Gate summary:',
        '| Stage | Status | Tests | Elapsed |',
        '| --- | --- | --- | --- |',
        '| lint | passed | - | 1.2s |',
        '| integration | skipped | - | - |',
        '| test:unit | passed | 193 passed | 40.1s |',
        '| test:e2e (affected journeys) | failed | 9 passed, 1 failed, 2 flaky, 3 did not run | 5.0s |',
        'Seed impact: acknowledged',
        'Journey fallbacks: apps/web/src/a.ts, apps/web/src/b.ts',
        'VALIDATE_AFFECTED: FAILED abc123',
        'EXIT 1',
        '',
      ].join('\n'),
    );
  });

  it('says so when the run ended before a plan or a stage', () => {
    expect(formatGateEnding({ exitCode: 0, tree: 'abc123' })).toBe(
      [
        '',
        'Gate summary:',
        'No stage results.',
        'Seed impact: not assessed',
        'Journey fallbacks: not assessed',
        'VALIDATE_AFFECTED: PASSED abc123',
        'EXIT 0',
        '',
      ].join('\n'),
    );
  });
});

describe('countTests', () => {
  it('sums the runners’ own totals per stage, through turbo prefixes and colour', () => {
    const { counts, output } = countTests({ output: silent });
    const lines = [
      '[test:unit] web:test:unit: \u001b[2m Test Files \u001b[22m 2 passed (2)',
      '[test:unit] web:test:unit: \u001b[2m      Tests \u001b[22m \u001b[32m5 passed\u001b[39m (5)',
      '[test:unit] server:test:unit:       Tests  1 failed | 4 passed | 2 skipped (7)',
      '[test:integration] @church/db:test:integration:       Tests  8 passed (8)',
      '[test:e2e] web:test:e2e:   1 failed',
      '[test:e2e] web:test:e2e:   2 did not run',
      '[test:e2e] web:test:e2e:   12 passed (1.2m)',
      '[test:tooling]  300 pass',
      '[test:tooling]  1 skip',
      '[test:tooling]  0 fail',
      // Not a runner total.
      '[lint]  4 pass',
      '[test:e2e] web:test:e2e:     3 passed to the helper',
    ];

    for (const line of lines) output.stdout({ text: `${line}\n` });

    expect(counts).toEqual({
      'test:e2e': { 'did not run': 2, failed: 1, passed: 12 },
      'test:integration': { passed: 8 },
      'test:tooling': { failed: 0, passed: 300, skipped: 1 },
      'test:unit': { failed: 1, passed: 9, skipped: 2 },
    });
  });

  it('forwards every line unchanged, counting stderr too', () => {
    const written: string[] = [];
    const { counts, output } = countTests({
      output: {
        stderr: ({ text }) => written.push(text),
        stdout: ({ text }) => written.push(text),
      },
    });

    output.stderr({ text: '[test:tooling]  2 pass\n' });
    output.stdout({ text: '[lint] ok\n' });

    expect(written).toEqual(['[test:tooling]  2 pass\n', '[lint] ok\n']);
    expect(counts).toEqual({ 'test:tooling': { passed: 2 } });
  });
});
