import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * The web build's gzip budget (#1172). It reads the `dist` the type check
 * already built and never builds.
 */

type BudgetedKind = 'entry' | 'entry-css' | 'shared';

export interface BundleChunk {
  bytes: number;
  file: string;
  /** `other` is a lazy chunk: printed, not budgeted. */
  kind: BudgetedKind | 'other';
}

type BundleLimits = Record<BudgetedKind, number>;

/**
 * Gzip bytes per chunk; `shared` applies to each preloaded chunk on its own.
 * Set from the build on 2026-11-27 plus about 3-5%: entry 98,178, entry CSS
 * 28,625, largest shared chunk 40,411 (Bun's gzip). Raise one only on purpose.
 */
const LIMITS: BundleLimits = {
  entry: 101_000,
  'entry-css': 30_000,
  shared: 42_000,
};

interface JudgeBundleInput {
  chunks: BundleChunk[];
  limits: BundleLimits;
}

export function judgeBundle({ chunks, limits }: JudgeBundleInput) {
  const lines = ['gzip bytes  limit  kind       chunk'];
  const failures: string[] = [];
  for (const { bytes, file, kind } of chunks) {
    const limit = kind === 'other' ? undefined : limits[kind];
    lines.push(
      `${String(bytes).padStart(10)}  ${String(limit ?? '-').padStart(5)}  ${kind.padEnd(9)}  ${file}`,
    );
    if (limit !== undefined && bytes > limit) {
      failures.push(
        `${kind} chunk ${file} is ${bytes} gzip bytes, ${bytes - limit} over its limit of ${limit}.`,
      );
    }
  }
  // A build whose shape changed must not pass by having nothing to judge.
  for (const kind of Object.keys(limits)) {
    if (!chunks.some((chunk) => chunk.kind === kind)) {
      failures.push(`index.html names no ${kind} chunk.`);
    }
  }
  const passed = failures.length === 0;
  if (passed) lines.push('Bundle budget passed.');
  for (const failure of failures) {
    lines.push(`Bundle budget FAILED: ${failure}`);
  }
  return { lines, passed };
}

const KIND_ORDER = ['entry', 'entry-css', 'shared', 'other'];

/** Every JS and CSS chunk in `dist/assets`, classed by how index.html loads it. */
export function readChunks({ distDir }: { distDir: string }): BundleChunk[] {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const kinds = new Map<string, BudgetedKind>();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const file = /(?:src|href)="\/(assets\/[^"]+)"/.exec(tag)?.[1];
    if (!file) continue;
    if (tag.includes('rel="modulepreload"')) kinds.set(file, 'shared');
    else if (tag.includes('rel="stylesheet"')) kinds.set(file, 'entry-css');
    else if (tag.includes('type="module"')) kinds.set(file, 'entry');
  }
  return readdirSync(join(distDir, 'assets'))
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name): BundleChunk => {
      const file = `assets/${name}`;
      const bytes = gzipSync(readFileSync(join(distDir, file))).length;
      return { bytes, file, kind: kinds.get(file) ?? 'other' };
    })
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        b.bytes - a.bytes,
    );
}

if (import.meta.main) {
  const distDir = join(import.meta.dir, '../../apps/web/dist');
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error(
      'Bundle budget FAILED: apps/web/dist is not built; run `bun run typecheck` first.',
    );
    process.exit(1);
  }
  const chunks = readChunks({ distDir });
  const { lines, passed } = judgeBundle({ chunks, limits: LIMITS });
  console.log(lines.join('\n'));
  if (!passed) process.exitCode = 1;
}
