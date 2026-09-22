import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the naming boundary between runners: Playwright owns `.spec.ts`,
 * Vitest owns `.test.ts`/`.test.tsx` (unit/component/integration), and
 * helpers use neither suffix. Runs the real `playwright test --list` against
 * this repo's tests/ tree so a future testMatch change that widens discovery
 * fails loudly instead of silently running a component test as E2E.
 */

const WEB_ROOT = resolve(import.meta.dirname, '..');
const TESTS_DIR = join(WEB_ROOT, 'tests');
const PLAYWRIGHT_BIN = join(WEB_ROOT, 'node_modules/.bin/playwright');
const NON_SPEC_TEST_FILE = /\.(test\.tsx?|helpers\.ts)$/;
const IGNORED_DIR_NAMES = new Set(['.auth']);

interface PlaywrightListSuite {
  file?: string;
  suites?: PlaywrightListSuite[];
}

interface PlaywrightListReport {
  suites: PlaywrightListSuite[];
}

interface WalkSuitesParams {
  suite: PlaywrightListSuite;
  discoveredFiles: Set<string>;
}

function walkSuites({ suite, discoveredFiles }: WalkSuitesParams): void {
  if (suite.file) discoveredFiles.add(suite.file);
  for (const child of suite.suites ?? []) {
    walkSuites({ suite: child, discoveredFiles });
  }
}

function discoverPlaywrightFiles(): Set<string> {
  const output = execFileSync(
    PLAYWRIGHT_BIN,
    ['test', '--list', '--reporter=json'],
    { cwd: WEB_ROOT, encoding: 'utf-8' },
  );
  const report = JSON.parse(output) as PlaywrightListReport;
  const discoveredFiles = new Set<string>();
  for (const suite of report.suites) {
    walkSuites({ suite, discoveredFiles });
  }
  return discoveredFiles;
}

interface FindNonSpecTestFilesParams {
  directory: string;
}

function findNonSpecTestFiles({
  directory,
}: FindNonSpecTestFilesParams): string[] {
  const matches: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      matches.push(...findNonSpecTestFiles({ directory: fullPath }));
      continue;
    }
    if (NON_SPEC_TEST_FILE.test(entry)) {
      matches.push(relative(TESTS_DIR, fullPath));
    }
  }
  return matches;
}

describe('playwright e2e discovery boundary', () => {
  it('discovers only spec-suffixed files', () => {
    const discoveredFiles = discoverPlaywrightFiles();

    expect(discoveredFiles.size).toBeGreaterThan(0);
    for (const file of discoveredFiles) {
      expect(file).toMatch(/\.spec\.ts$/);
    }
  });

  it('never discovers Vitest test files or bare helpers under tests/', () => {
    const discoveredFiles = discoverPlaywrightFiles();
    const nonSpecTestFiles = findNonSpecTestFiles({ directory: TESTS_DIR });

    // Proves the assertion below is meaningful: there is real Vitest/helper
    // content under tests/ for discovery to have wrongly picked up.
    expect(nonSpecTestFiles.length).toBeGreaterThan(0);

    for (const file of nonSpecTestFiles) {
      expect(discoveredFiles.has(file)).toBe(false);
    }
  });
});
