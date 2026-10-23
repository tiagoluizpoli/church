import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const TESTS_ROOT = 'apps/web/tests/';
const IMPORT_SPECIFIER =
  /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

/** Maps each repo-relative web test file to the repo-relative files it imports. */
export type E2eImportGraph = Record<string, string[]>;

function resolveSpecifier({
  importer,
  specifier,
}: {
  importer: string;
  specifier: string;
}): string | null {
  const base = specifier.startsWith('@/tests/')
    ? join('apps/web', specifier.slice(2))
    : specifier.startsWith('.')
      ? normalize(join(dirname(importer), specifier))
      : null;
  if (!base?.startsWith(TESTS_ROOT)) return null;
  return (
    [`${base}.ts`, `${base}/index.ts`].find((candidate) =>
      existsSync(resolve(REPO_ROOT, candidate)),
    ) ?? null
  );
}

export function readE2eImportGraph(): E2eImportGraph {
  const graph: E2eImportGraph = {};
  for (const file of new Glob(`${TESTS_ROOT}**/*.ts`).scanSync({
    cwd: REPO_ROOT,
  })) {
    if (/\.test\.tsx?$/.test(file)) continue;
    const source = readFileSync(resolve(REPO_ROOT, file), 'utf8');
    graph[file] = [...source.matchAll(IMPORT_SPECIFIER)]
      .map(([, from, bare]) =>
        resolveSpecifier({ importer: file, specifier: from ?? bare ?? '' }),
      )
      .filter((path): path is string => path !== null);
  }
  return graph;
}

/** Specs (relative to apps/web/) that reach `changedPath`; a spec reaches itself. */
export function selectSpecsReaching({
  changedPath,
  graph,
}: {
  changedPath: string;
  graph: E2eImportGraph;
}): string[] {
  const visited = new Set([changedPath]);
  const queue = [changedPath];
  for (const current of queue) {
    for (const [importer, imports] of Object.entries(graph)) {
      if (imports.includes(current) && !visited.has(importer)) {
        visited.add(importer);
        queue.push(importer);
      }
    }
  }
  return [...visited]
    .filter((path) => path.endsWith('.spec.ts'))
    .map((path) => path.slice('apps/web/'.length))
    .sort();
}
