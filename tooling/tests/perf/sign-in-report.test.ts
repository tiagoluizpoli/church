import { describe, expect, test } from 'bun:test';
import { formatSignInReport } from '../../perf/sign-in-report';

describe('perf:sign-in report', () => {
  test('prints the three times beside the #1121 reference and the frames', () => {
    const lines = formatSignInReport({
      url: 'http://church-x.localhost:4000/login',
      conditions: 'Slow 4G, 4x CPU, 390x844',
      timings: { firstPaintMs: 312, lcpMs: 1405.4, formReadyMs: 3298 },
      frames: { count: 12, directory: 'tmp/perf-sign-in' },
    });

    expect(lines).toEqual([
      'perf:sign-in http://church-x.localhost:4000/login (Slow 4G, 4x CPU, 390x844)',
      '| Moment | This run | #1121 reference |',
      '| --- | --- | --- |',
      '| First paint | 0.31 s | ~0.31 s |',
      '| LCP | 1.41 s | ~1.41 s |',
      '| Form usable | 3.30 s | ~3.3 s |',
      'Frames: 12 in tmp/perf-sign-in',
    ]);
  });
});
