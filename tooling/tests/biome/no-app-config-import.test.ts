import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Keeps the app-config import ban armed across Biome upgrades
 * (docs/agents/backend.md): runs the real GritQL rule from biome.json against
 * fixture files laid out at repo-shaped paths.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const RULE_PATH = join(REPO_ROOT, 'tooling/biome/no-app-config-import.grit');
const BIOME_BIN = join(REPO_ROOT, 'node_modules/.bin/biome');

interface BiomeConfig {
  plugins: string[];
}

const config = JSON.parse(
  readFileSync(join(REPO_ROOT, 'biome.json'), 'utf8'),
) as BiomeConfig;

const VIOLATIONS: Record<string, string> = {
  'named-config':
    "import { appConfig } from '@church/app-config';\nexport const x = appConfig;\n",
  'named-park':
    "import { withAllParkedOn } from '@church/app-config';\nexport const x = withAllParkedOn;\n",
  'named-schema':
    "import { appConfigSchema } from '@church/app-config';\nexport const x = appConfigSchema;\n",
  mixed:
    "import { appConfig, type AppConfig } from '@church/app-config';\nexport const x: AppConfig = appConfig;\n",
  namespace:
    "import * as cfg from '@church/app-config';\nexport const x = cfg;\n",
  default: "import cfg from '@church/app-config';\nexport const x = cfg;\n",
  'side-effect': "import '@church/app-config';\n",
  reexport: "export { appConfig } from '@church/app-config';\n",
  'reexport-all': "export * from '@church/app-config';\n",
};

const ALLOWED: Record<string, string> = {
  'import-type':
    "import type { AppConfig } from '@church/app-config';\nexport type X = AppConfig;\n",
  'inline-type':
    "import { type AppConfig } from '@church/app-config';\nexport type X = AppConfig;\n",
  'inline-types':
    "import { type AppConfig, type AppConfigInput } from '@church/app-config';\nexport type X = [AppConfig, AppConfigInput];\n",
  'reexport-type': "export type { AppConfig } from '@church/app-config';\n",
  'reexport-inline-type':
    "export { type AppConfig } from '@church/app-config';\n",
  lookalike:
    "import { appConfig } from '@church/app-config-x';\nexport const x = appConfig;\n",
  'other-package':
    "import { appConfig } from '@church/other';\nexport const x = appConfig;\n",
};

const LAYERS = ['api', 'application', 'infrastructure', 'domain', 'main'];
const VALUE_ROOTS = [
  'apps/server/src/main/di',
  'apps/server/src/scripts',
  'apps/server/seeds',
  'apps/server/tests/api',
  'apps/web/src/features/x',
  'packages/core/src',
];

const fixtures: Record<string, string> = {};
const expected: string[] = [];
for (const layer of LAYERS) {
  for (const [name, source] of Object.entries(VIOLATIONS)) {
    const path = `apps/server/src/${layer}/${name}.ts`;
    fixtures[path] = source;
    expected.push(path);
  }
  for (const [name, source] of Object.entries(ALLOWED)) {
    fixtures[`apps/server/src/${layer}/${name}.ts`] = source;
  }
}
for (const root of VALUE_ROOTS) {
  for (const [name, source] of Object.entries(VIOLATIONS)) {
    fixtures[`${root}/${name}.ts`] = source;
  }
}

let workDir = '';
let flagged: string[] = [];

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'no-app-config-import-'));
  writeFileSync(
    join(workDir, 'biome.json'),
    JSON.stringify({
      plugins: [RULE_PATH],
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: { enabled: true, rules: { recommended: false } },
    }),
  );
  for (const [path, source] of Object.entries(fixtures)) {
    mkdirSync(dirname(join(workDir, path)), { recursive: true });
    writeFileSync(join(workDir, path), source);
  }
  const result = Bun.spawnSync(
    [BIOME_BIN, 'lint', '--max-diagnostics=2000', 'apps', 'packages'],
    { cwd: workDir },
  );
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  flagged = [...output.matchAll(/^(\S+):\d+:\d+ plugin /gm)]
    .map((match) => match[1])
    .sort();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('no app-config import lint rule', () => {
  it('flags value imports and re-exports in apps/server/src outside main/di and scripts, and nothing else', () => {
    expect(flagged).toEqual(expected.sort());
  });

  it('is registered in biome.json', () => {
    expect(config.plugins).toContain(
      './tooling/biome/no-app-config-import.grit',
    );
  });
});
