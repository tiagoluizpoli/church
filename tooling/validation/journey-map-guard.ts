import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  CRITICAL_SMOKE_SPEC_PATHS,
  JOURNEY_MAP,
  type JourneyMapping,
} from './journey-map';

const WEB_ROOT = resolve(import.meta.dir, '../../apps/web');
const SPEC_NAME_PATTERN = /\.spec\.ts$/;

// Every Playwright spec must be referenced by the union of JOURNEY_MAP and
// CRITICAL_SMOKE_SPEC_PATHS (#557), and every reference must name a spec that
// exists. Whether a mapping's sourcePathPrefix is accurate stays a review call.
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
    .sort()
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
        `${path}: stale JOURNEY_MAP reference (sourcePathPrefix ${[...prefixes].sort().join(', ')}): no such Playwright spec under apps/web/tests/`,
    );

  const staleSmoke = [...new Set(criticalSmokeSpecPaths)]
    .filter((path) => !specs.has(path))
    .sort()
    .map(
      (path) =>
        `${path}: stale CRITICAL_SMOKE_SPEC_PATHS reference: no such Playwright spec under apps/web/tests/`,
    );

  return [...unmapped, ...staleMap, ...staleSmoke];
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
  const webRoot =
    webRootIndex === -1
      ? WEB_ROOT
      : resolve(process.argv[webRootIndex + 1] ?? '');
  try {
    const failures = getJourneyMapFailures({
      specPaths: discoverPlaywrightSpecPaths({ webRoot }),
      journeyMap: JOURNEY_MAP,
      criticalSmokeSpecPaths: CRITICAL_SMOKE_SPEC_PATHS,
    });
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `cannot read Playwright specs under ${join(webRoot, 'tests')}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
