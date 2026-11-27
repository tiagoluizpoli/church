import { describe, expect, it } from 'bun:test';
import { judgeModuleRequests } from '../../validation/dev-module-cap';

describe('dev module cap verdict', () => {
  it('passes at the cap and prints the count and the cap', () => {
    expect(judgeModuleRequests({ count: 200, cap: 200 })).toEqual({
      lines: [
        '/login under vite dev: 200 module requests, cap 200.',
        'Dev module cap passed.',
      ],
      passed: true,
    });
  });

  it('fails above the cap and says by how much', () => {
    expect(judgeModuleRequests({ count: 2513, cap: 200 })).toEqual({
      lines: [
        '/login under vite dev: 2513 module requests, cap 200.',
        'Dev module cap FAILED: 2313 over the cap. Look for a change that compiles or imports many more modules in dev.',
      ],
      passed: false,
    });
  });

  // A page that never loaded must not pass by having nothing to count.
  it('fails when no module was requested', () => {
    expect(judgeModuleRequests({ count: 0, cap: 200 })).toEqual({
      lines: [
        '/login under vite dev: 0 module requests, cap 200.',
        'Dev module cap FAILED: nothing was counted, so the page did not load from vite dev.',
      ],
      passed: false,
    });
  });
});
