import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import { judgeBundle, readChunks } from '../../validation/bundle-budget';

const limits = { entry: 1000, 'entry-css': 500, shared: 300 };

const chunks = [
  { bytes: 900, file: 'assets/index-a.js', kind: 'entry' as const },
  { bytes: 500, file: 'assets/index-b.css', kind: 'entry-css' as const },
  { bytes: 100, file: 'assets/button-c.js', kind: 'shared' as const },
  { bytes: 9000, file: 'assets/lazy-d.js', kind: 'other' as const },
];

describe('judgeBundle', () => {
  it('passes at or under every limit and prints every size', () => {
    expect(judgeBundle({ chunks, limits })).toEqual({
      lines: [
        'gzip bytes  limit  kind       chunk',
        '       900   1000  entry      assets/index-a.js',
        '       500    500  entry-css  assets/index-b.css',
        '       100    300  shared     assets/button-c.js',
        '      9000      -  other      assets/lazy-d.js',
        'Bundle budget passed.',
      ],
      passed: true,
    });
  });

  it('fails naming every chunk over its limit', () => {
    const { lines, passed } = judgeBundle({
      chunks,
      limits: { entry: 800, 'entry-css': 500, shared: 60 },
    });

    expect(passed).toBe(false);
    expect(lines.slice(-2)).toEqual([
      'Bundle budget FAILED: entry chunk assets/index-a.js is 900 gzip bytes, 100 over its limit of 800.',
      'Bundle budget FAILED: shared chunk assets/button-c.js is 100 gzip bytes, 40 over its limit of 60.',
    ]);
  });

  it.each([
    'entry',
    'entry-css',
    'shared',
  ] as const)('fails when the build has no %s chunk to judge', (missing) => {
    const { lines, passed } = judgeBundle({
      chunks: chunks.filter(({ kind }) => kind !== missing),
      limits,
    });

    expect(passed).toBe(false);
    expect(lines.at(-1)).toBe(
      `Bundle budget FAILED: index.html names no ${missing} chunk.`,
    );
  });
});

describe('readChunks', () => {
  const distDir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
  afterAll(() => rmSync(distDir, { force: true, recursive: true }));

  it('classes each chunk by how the built index.html loads it', () => {
    mkdirSync(join(distDir, 'assets'));
    for (const name of ['index.js', 'index.css', 'button.js', 'lazy.js']) {
      writeFileSync(join(distDir, 'assets', name), 'x');
    }
    // The shapes Vite and non-blocking-entry-stylesheet.ts emit.
    writeFileSync(
      join(distDir, 'index.html'),
      [
        '<script type="module" crossorigin src="/assets/index.js"></script>',
        '<link rel="modulepreload" crossorigin href="/assets/button.js">',
        '<link rel="preload" as="style" crossorigin href="/assets/index.css">',
        '<link rel="stylesheet" crossorigin href="/assets/index.css" media="print">',
      ].join('\n'),
    );

    expect(
      readChunks({ distDir }).map(({ file, kind }) => [file, kind]),
    ).toEqual([
      ['assets/index.js', 'entry'],
      ['assets/index.css', 'entry-css'],
      ['assets/button.js', 'shared'],
      ['assets/lazy.js', 'other'],
    ]);
  });
});
