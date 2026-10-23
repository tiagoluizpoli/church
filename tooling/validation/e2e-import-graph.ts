import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const WEB_ROOT = 'apps/web/';
const TESTS_ROOT = `${WEB_ROOT}tests/`;
const WEB_ALIAS = '@/';
const IMPORT_SPECIFIER =
  /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

/** Maps each repo-relative web test file to the repo-relative files it imports. */
export type E2eImportGraph = Record<string, string[]>;

interface ResolveSpecifierInput {
  importer: string;
  specifier: string;
}

function resolveSpecifier({
  importer,
  specifier,
}: ResolveSpecifierInput): string | null {
  const base = specifier.startsWith('@/tests/')
    ? join(WEB_ROOT, specifier.slice(WEB_ALIAS.length))
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

interface SelectSpecsReachingInput {
  changedPath: string;
  graph: E2eImportGraph;
}

/** Specs (relative to apps/web/) that reach `changedPath`; a spec reaches itself. */
export function selectSpecsReaching({
  changedPath,
  graph,
}: SelectSpecsReachingInput): string[] {
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
    .map((path) => path.slice(WEB_ROOT.length))
    .sort();
}
