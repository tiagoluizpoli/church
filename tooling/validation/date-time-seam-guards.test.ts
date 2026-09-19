import { describe, expect, it } from 'bun:test';
import {
  getDateTimeSeamGuardFailures,
  readApplicationSourceFiles,
} from './date-time-seam-guards';

describe('date-time seam CI guards', () => {
  it('rejects suppressions of either seam rule', () => {
    expect(
      getDateTimeSeamGuardFailures({
        files: [
          {
            path: 'packages/core/src/example.ts',
            source: '// biome-ignore plugin: bypass the GritQL rule\n',
          },
          {
            path: 'apps/server/tests/example.test.ts',
            source:
              '// biome-ignore lint/style/noRestrictedImports: bypass the import rule\n',
          },
        ],
      }),
    ).toEqual([
      'packages/core/src/example.ts: biome-ignore suppresses a date-time seam rule',
      'apps/server/tests/example.test.ts: biome-ignore suppresses a date-time seam rule',
    ]);
  });

  it('rejects date-fns locale format tokens in every non-seam source file', () => {
    expect(
      getDateTimeSeamGuardFailures({
        files: [
          {
            path: 'apps/web/tests/example.test.ts',
            source:
              "format(value, 'PP'); formatInTimeZone(value, zone, 'p');\n",
          },
        ],
      }),
    ).toEqual([
      "apps/web/tests/example.test.ts: date-fns locale token 'PP' is forbidden",
      "apps/web/tests/example.test.ts: date-fns locale token 'p' is forbidden",
    ]);
  });

  it('exempts only the time seam and ignores unrelated suppressions', () => {
    expect(
      getDateTimeSeamGuardFailures({
        files: [
          {
            path: 'apps/web/src/example.test.tsx',
            source: "expect(element.tagName).toBe('P');\n",
          },
          {
            path: 'packages/time/src/display.ts',
            source: "format(value, 'PP');\n",
          },
          {
            path: 'apps/server/src/example.ts',
            source:
              '// biome-ignore lint/suspicious/noExplicitAny: justified\n',
          },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps the repository source free of date-time seam bypasses', () => {
    expect(
      getDateTimeSeamGuardFailures({ files: readApplicationSourceFiles() }),
    ).toEqual([]);
  });
});
