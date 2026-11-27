import { join, resolve } from 'node:path';
import {
  assertEveryE2eSpecHasOneLane,
  E2E_TEST_DIR,
  ISOLATED_SPECS,
} from '../../apps/web/tests/fixtures/e2e-lanes';

// The Playwright config's lane check, without starting Playwright.
const webRootIndex = process.argv.indexOf('--web-root');
const webRoot =
  webRootIndex === -1 ? undefined : process.argv[webRootIndex + 1];
const testDir = webRoot ? join(resolve(webRoot), 'tests') : E2E_TEST_DIR;

try {
  assertEveryE2eSpecHasOneLane({ testDir, isolatedSpecs: ISOLATED_SPECS });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
