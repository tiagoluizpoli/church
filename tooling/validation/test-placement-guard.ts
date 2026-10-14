import { posix } from 'node:path';
import { readApplicationSourceFiles, type SourceFile } from './source-files';

const TEST_NAME_PATTERN = /\.(test|spec|contract-spec)\.[cm]?[jt]sx?$/;
const TEST_FOLDER_PATTERN =
  /\/(__tests__|test-support|__mocks__|contract-tests)\//;

// Covers: from '…', import '…', import('…'), vi.mock/doMock/importActual('…').
const MODULE_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.(?:mock|doMock|importActual)(?:<.*?>)?\s*\(\s*)(['"])([^'"\n]+)\1/g;
const TEST_LIBRARY_PATTERN = /^(vitest|@testing-library\/.+|msw(\/.+)?)$/;

export function getTestPlacementFailures({
  files,
}: {
  files: SourceFile[];
}): string[] {
  return files.flatMap(({ path, source }) => {
    const failures: string[] = [];
    if (path.includes('/src/')) {
      if (TEST_NAME_PATTERN.test(path) || TEST_FOLDER_PATTERN.test(path)) {
        failures.push(
          `${path}: test file under src/: move it to the project's tests/ folder`,
        );
      }
      for (const [, , specifier] of source.matchAll(MODULE_SPECIFIER_PATTERN)) {
        if (specifier && TEST_LIBRARY_PATTERN.test(specifier)) {
          failures.push(
            `${path}: imports ${specifier} under src/: test code belongs in the project's tests/ folder`,
          );
        }
      }
    }
    const app = path.match(/^apps\/[^/]+(?=\/tests\/)/)?.[0];
    if (app) {
      for (const [, , specifier] of source.matchAll(MODULE_SPECIFIER_PATTERN)) {
        const target = posix.join(posix.dirname(path), specifier ?? '');
        if (specifier?.startsWith('../') && target.startsWith(`${app}/`)) {
          failures.push(
            `${path}: '${specifier}' climbs with ../: import it as @/…, @/tests/… or @/seeds/…`,
          );
        }
      }
    }
    return failures;
  });
}

if (import.meta.main) {
  const failures = getTestPlacementFailures({
    files: readApplicationSourceFiles(),
  });

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
