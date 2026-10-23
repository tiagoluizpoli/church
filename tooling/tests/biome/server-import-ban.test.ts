import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Keeps the server-import ban armed across Biome upgrades (constitution,
 * Monorepo Boundaries): runs the real restricted-import options and overrides
 * from biome.json against fixture files laid out at repo-shaped paths.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const BIOME_BIN = join(REPO_ROOT, 'node_modules/.bin/biome');
const BOUNDARY = 'Only apps/server imports the server';

interface BiomeOverride {
  includes: string[];
  linter?: { rules?: { style?: { noRestrictedImports?: unknown } } };
}

interface BiomeConfig {
  linter: { rules: { style: { noRestrictedImports: unknown } } };
  overrides: BiomeOverride[];
}

const config = JSON.parse(
  readFileSync(join(REPO_ROOT, 'biome.json'), 'utf8'),
) as BiomeConfig;

const CLIENT_DIRS = [
  'apps/web/src/features/x',
  'apps/web/tests/features/x',
  'apps/desktop/src/x',
  'packages/core/src/x',
  'packages/time/src/x',
];

const banned = (dir: string): Record<string, string> => {
  const intoServer = relative(dir, 'apps/server/src/app');
  return {
    value: "import { app } from '@church/server';\nexport const a = app;\n",
    subpath:
      "import { app } from '@church/server/src/app';\nexport const a = app;\n",
    'type-only':
      "import type { App } from '@church/server';\nexport type A = App;\n",
    're-export': "export { app } from '@church/server';\n",
    bare: "import { app } from 'server';\nexport const a = app;\n",
    'bare-subpath':
      "import { app } from 'server/src/app';\nexport const a = app;\n",
    relative: `import { app } from '${intoServer}';\nexport const a = app;\n`,
  };
};

const BANNED_FIXTURES = Object.fromEntries(
  CLIENT_DIRS.flatMap((dir) =>
    Object.entries(banned(dir)).map(([name, source]) => [
      `${dir}/${name}.ts`,
      source,
    ]),
  ),
);

const ENV_SERVER =
  "import { env } from '@church/env/server';\nexport const e = env;\n";

const ALLOWED_FIXTURES: Record<string, string> = {
  'apps/web/src/features/x/env-server.ts': ENV_SERVER,
  'packages/core/src/x/env-server.ts': ENV_SERVER,
  'apps/web/src/features/x/church-core.ts':
    "import { core } from '@church/core';\nexport const c = core;\n",
  'apps/server/src/api/imports-server.ts':
    "import { app } from '@church/server';\nexport const a = app;\n",
  'apps/server/tests/api/imports-server.test.ts':
    "import { app } from '@church/server';\nexport const a = app;\n",
  // Guards the packages/time date-fns exemption alongside the server ban.
  'packages/time/src/x/date-fns.ts':
    "import { format } from 'date-fns';\nexport const f = format;\n",
  // Relative `server` specifiers that stay inside the workspace are not the server.
  'packages/env/src/sub/a.ts':
    "import { env } from '../server';\nexport const e = env;\n",
  'packages/env/src/sub/deeper/a.ts':
    "import { env } from '../../server';\nexport const e = env;\n",
  'apps/web/src/a/b.ts':
    "import { util } from '../server/util';\nexport const u = util;\n",
};

let workDir = '';
let diagnostics: { file: string; message: string }[] = [];

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'server-import-ban-'));
  const restrictedOverrides = config.overrides.filter(
    (override) => override.linter?.rules?.style?.noRestrictedImports,
  );
  writeFileSync(
    join(workDir, 'biome.json'),
    JSON.stringify({
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: {
        enabled: true,
        rules: {
          recommended: false,
          style: {
            noRestrictedImports: config.linter.rules.style.noRestrictedImports,
          },
        },
      },
      overrides: restrictedOverrides,
    }),
  );
  for (const [path, source] of Object.entries({
    ...BANNED_FIXTURES,
    ...ALLOWED_FIXTURES,
  })) {
    mkdirSync(dirname(join(workDir, path)), { recursive: true });
    writeFileSync(join(workDir, path), source);
  }
  const result = Bun.spawnSync(
    [
      BIOME_BIN,
      'lint',
      '--reporter=github',
      '--max-diagnostics=500',
      'apps',
      'packages',
    ],
    { cwd: workDir },
  );
  diagnostics = [
    ...result.stdout
      .toString()
      .matchAll(
        /^::error title=lint\/style\/noRestrictedImports,file=([^,]+),.*?::(.*)$/gm,
      ),
  ].map((match) => ({ file: match[1] ?? '', message: match[2] ?? '' }));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('server import ban', () => {
  it('flags every banned form outside apps/server with the boundary message naming the orval functions, and nothing else', () => {
    const flagged = diagnostics.map(({ file }) => file).sort();
    expect(flagged).toEqual(Object.keys(BANNED_FIXTURES).sort());
    for (const { message } of diagnostics) {
      expect(message).toContain(BOUNDARY);
      expect(message).toContain('apps/web/src/infrastructure/api/');
    }
  });
});
