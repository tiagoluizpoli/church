import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  CRITICAL_SMOKE_SPEC_PATHS,
  DELIBERATE_SMOKE_FALLBACK_PATHS,
  JOURNEY_MAP,
  type JourneyMapping,
} from './journey-map';
import { isProductionSourcePath } from './production-path';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const WEB_ROOT = join(REPO_ROOT, 'apps/web');
const SPEC_NAME_PATTERN = /\.spec\.ts$/;
const NO_SUCH_SPEC = 'no such Playwright spec under apps/web/tests/';

// Every Playwright spec must be referenced by the union of JOURNEY_MAP and
// CRITICAL_SMOKE_SPEC_PATHS (#557), and every reference must name a spec that
// exists. Whether a live sourcePathPrefix maps the right specs stays a review
// call.
export function getJourneyMapFailures({
  specPaths,
  journeyMap,
  criticalSmokeSpecPaths,
}: {
  specPaths: string[];
  journeyMap: JourneyMapping[];
  criticalSmokeSpecPaths: string[];
}): string[] {
  const specs = new Set(specPaths);
  const referenced = new Set([
    ...journeyMap.flatMap(({ specPaths }) => specPaths),
    ...criticalSmokeSpecPaths,
  ]);

  const unmapped = [...specs]
    .filter((path) => !referenced.has(path))
    .sort((a, b) => a.localeCompare(b))
    .map(
      (path) =>
        `${path}: unmapped Playwright spec: add it to JOURNEY_MAP or CRITICAL_SMOKE_SPEC_PATHS in tooling/validation/journey-map.ts`,
    );

  const staleMapPrefixes = new Map<string, Set<string>>();
  for (const { sourcePathPrefix, specPaths } of journeyMap) {
    for (const path of specPaths) {
      if (!specs.has(path)) {
        staleMapPrefixes.set(
          path,
          (staleMapPrefixes.get(path) ?? new Set()).add(sourcePathPrefix),
        );
      }
    }
  }
  const staleMap = [...staleMapPrefixes]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([path, prefixes]) =>
        `${path}: stale JOURNEY_MAP reference (sourcePathPrefix ${[...prefixes].sort().join(', ')}): ${NO_SUCH_SPEC}`,
    );

  const staleSmoke = [...new Set(criticalSmokeSpecPaths)]
    .filter((path) => !specs.has(path))
    .sort((a, b) => a.localeCompare(b))
    .map(
      (path) =>
        `${path}: stale CRITICAL_SMOKE_SPEC_PATHS reference: ${NO_SUCH_SPEC}`,
    );

  return [...unmapped, ...staleMap, ...staleSmoke];
}

// #900: a deliberate smoke fallback names an existing file that no JOURNEY_MAP
// prefix covers; otherwise it is stale or contradicts the map.
export function getDeliberateFallbackFailures({
  fallbackPaths,
  journeyMap,
  fileExists = (path) => existsSync(join(REPO_ROOT, path)),
}: {
  fallbackPaths: string[];
  journeyMap: JourneyMapping[];
  fileExists?: (path: string) => boolean;
}): string[] {
  return fallbackPaths.flatMap((path) => {
    const prefixes = journeyMap
      .map(({ sourcePathPrefix }) => sourcePathPrefix)
      .filter((prefix) => path.startsWith(prefix));
    return [
      ...(fileExists(path)
        ? []
        : [
            `${path}: stale DELIBERATE_SMOKE_FALLBACK_PATHS entry: no such file`,
          ]),
      ...(prefixes.length > 0
        ? [
            `${path}: DELIBERATE_SMOKE_FALLBACK_PATHS entry is covered by JOURNEY_MAP (sourcePathPrefix ${[...new Set(prefixes)].sort().join(', ')}): remove one of them`,
          ]
        : []),
    ];
  });
}

// A mapping whose prefix matches no production path can never select a
// journey: its file moved, was deleted, or is not one the plan maps.
export function getDeadMappingFailures({
  journeyMap,
  paths,
}: {
  journeyMap: JourneyMapping[];
  paths: string[];
}): string[] {
  const productionPaths = paths.filter((changedPath) =>
    isProductionSourcePath({ changedPath }),
  );
  return [
    ...new Set(journeyMap.map(({ sourcePathPrefix }) => sourcePathPrefix)),
  ]
    .filter(
      (prefix) => !productionPaths.some((path) => path.startsWith(prefix)),
    )
    .sort((a, b) => a.localeCompare(b))
    .map(
      (prefix) =>
        `${prefix}: dead JOURNEY_MAP sourcePathPrefix: no production path matches it`,
    );
}

// The files a mapping may name, repo-root-relative: each app's source and
// seeds, plus the web page.
export function discoverProductionPaths(): string[] {
  const sourceRoots = ['apps/web/src', 'apps/server/src', 'apps/server/seeds'];
  const sources = sourceRoots
    .filter((root) => existsSync(join(REPO_ROOT, root)))
    .flatMap((root) =>
      readdirSync(join(REPO_ROOT, root), {
        recursive: true,
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) =>
          relative(REPO_ROOT, join(entry.parentPath, entry.name))
            .split(sep)
            .join('/'),
        ),
    );
  return [...sources, 'apps/web/index.html'].filter((changedPath) =>
    isProductionSourcePath({ changedPath }),
  );
}

// Paths come back relative to the web root with a tests/ prefix, matching the
// metadata convention. A missing or unreadable tests root throws.
export function discoverPlaywrightSpecPaths({
  webRoot = WEB_ROOT,
}: {
  webRoot?: string;
} = {}): string[] {
  return readdirSync(join(webRoot, 'tests'), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && SPEC_NAME_PATTERN.test(entry.name))
    .map((entry) =>
      relative(webRoot, join(entry.parentPath, entry.name))
        .split(sep)
        .join('/'),
    )
    .sort();
}

if (import.meta.main) {
  const webRootIndex = process.argv.indexOf('--web-root');
  let webRoot = WEB_ROOT;
  if (webRootIndex !== -1) {
    const webRootArg = process.argv[webRootIndex + 1];
    if (!webRootArg) {
      console.error('--web-root needs a directory');
      process.exit(1);
    }
    webRoot = resolve(webRootArg);
  }
  let specPaths: string[];
  try {
    specPaths = discoverPlaywrightSpecPaths({ webRoot });
  } catch (error) {
    console.error(
      `cannot read Playwright specs under ${join(webRoot, 'tests')}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const failures = [
    ...getJourneyMapFailures({
      specPaths,
      journeyMap: JOURNEY_MAP,
      criticalSmokeSpecPaths: CRITICAL_SMOKE_SPEC_PATHS,
    }),
    ...getDeadMappingFailures({
      journeyMap: JOURNEY_MAP,
      paths: discoverProductionPaths(),
    }),
    ...getDeliberateFallbackFailures({
      fallbackPaths: DELIBERATE_SMOKE_FALLBACK_PATHS.map(({ path }) => path),
      journeyMap: JOURNEY_MAP,
    }),
  ];
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
