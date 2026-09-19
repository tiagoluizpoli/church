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
 * Keeps the date-time seam armed across Biome upgrades (ADR-0003): runs the
 * real GritQL rule and the real restricted-import options from biome.json
 * against fixture files laid out at repo-shaped paths.
 */

const REPO_ROOT = resolve(import.meta.dir, '../..');
const RULE_PATH = join(REPO_ROOT, 'tooling/biome/date-time-seam.grit');
const BIOME_BIN = join(REPO_ROOT, 'node_modules/.bin/biome');

interface RestrictedImportsOptions {
  paths?: Record<string, string>;
  patterns?: unknown[];
}

interface RestrictedImportsRule {
  level: string;
  options?: RestrictedImportsOptions;
}

interface OverrideStyleRules {
  noRestrictedImports?: RestrictedImportsRule | 'off';
}

interface OverrideRules {
  style?: OverrideStyleRules;
}

interface OverrideLinter {
  rules?: OverrideRules;
}

interface BiomeOverride {
  includes: string[];
  linter?: OverrideLinter;
}

interface RootStyleRules {
  noRestrictedImports: RestrictedImportsRule;
}

interface RootRules {
  style: RootStyleRules;
}

interface RootLinter {
  rules: RootRules;
}

interface BiomeConfig {
  plugins: string[];
  linter: RootLinter;
  overrides: BiomeOverride[];
}

const config = JSON.parse(
  readFileSync(join(REPO_ROOT, 'biome.json'), 'utf8'),
) as BiomeConfig;

const RAW_DATE = 'export const value = new Date();\n';
const FIXTURES: Record<string, string> = {
  'apps/server/src/domain/entity.ts': RAW_DATE,
  'apps/server/src/application/iso.ts':
    'export const iso = (d: Date) => d.toISOString();\n',
  'apps/web/src/features/x/label.ts':
    'export const label = (d: Date) => d.toLocaleDateString();\n',
  'apps/web/src/features/x/hours.ts':
    'export const hours = (d: Date) => d.getHours();\n',
  'apps/web/src/features/x/intl.ts':
    "export const fmt = new Intl.DateTimeFormat('en');\n",
  'apps/web/src/features/x/now.ts': 'export const stamp = Date.now();\n',
  'apps/web/src/components/ui/button.tsx': RAW_DATE,
  'apps/web/src/components/ui/calendar.tsx': RAW_DATE,
  'apps/web/src/features/x/imports-fns.ts':
    "import { format } from 'date-fns';\nexport const f = format;\n",
  'apps/web/src/features/x/imports-tz.ts':
    "import { formatInTimeZone } from 'date-fns-tz';\nexport const f = formatInTimeZone;\n",
  'packages/time/src/seam.ts':
    "import { format } from 'date-fns';\nexport const f = [format, new Date()];\n",
  'packages/db/src/schema/core.ts': RAW_DATE,
  'packages/core/src/entity.ts': RAW_DATE,
  'apps/server/tests/domain/entity.test.ts': RAW_DATE,
  'apps/web/src/features/x/card.component.test.tsx': RAW_DATE,
  'apps/web/src/__tests__/setup/render.tsx': RAW_DATE,
  'apps/server/src/domain/contracts/contract-tests/x.contract-spec.ts':
    RAW_DATE,
  'apps/server/src/test-support/fixtures.ts': RAW_DATE,
};

let workDir = '';
let flagged: string[] = [];

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'date-time-seam-'));
  const timeOverride = config.overrides.find((override) =>
    override.includes.includes('packages/time/**'),
  );
  writeFileSync(
    join(workDir, 'biome.json'),
    JSON.stringify({
      plugins: [RULE_PATH],
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
      overrides: timeOverride ? [timeOverride] : [],
    }),
  );
  for (const [path, source] of Object.entries(FIXTURES)) {
    mkdirSync(dirname(join(workDir, path)), { recursive: true });
    writeFileSync(join(workDir, path), source);
  }
  const result = Bun.spawnSync(
    [BIOME_BIN, 'lint', '--max-diagnostics=500', 'apps', 'packages'],
    { cwd: workDir },
  );
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  flagged = [
    ...output.matchAll(
      /^(\S+):\d+:\d+ (plugin|lint\/style\/noRestrictedImports) /gm,
    ),
  ]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('date-time seam lint rule', () => {
  it('flags raw date APIs and date-fns imports outside the seam, and nothing else', () => {
    expect(flagged).toEqual(
      [
        'apps/server/src/application/iso.ts plugin',
        'apps/server/src/domain/entity.ts plugin',
        'apps/web/src/components/ui/button.tsx plugin',
        'apps/web/src/features/x/hours.ts plugin',
        'apps/web/src/features/x/imports-fns.ts lint/style/noRestrictedImports',
        'apps/web/src/features/x/imports-tz.ts lint/style/noRestrictedImports',
        'apps/web/src/features/x/intl.ts plugin',
        'apps/web/src/features/x/label.ts plugin',
        'apps/web/src/features/x/now.ts plugin',
      ].sort(),
    );
  });

  it('is registered in biome.json', () => {
    expect(config.plugins).toContain('./tooling/biome/date-time-seam.grit');
  });

  it('keeps the date-fns ban in every override that replaces restricted-import options', () => {
    // An override's options replace the top-level ones rather than merging.
    const replacing = config.overrides.filter((override) => {
      const rule = override.linter?.rules?.style?.noRestrictedImports;
      return typeof rule === 'object' && rule.options !== undefined;
    });
    expect(replacing.length).toBeGreaterThan(0);
    for (const override of replacing) {
      const rule = override.linter?.rules?.style
        ?.noRestrictedImports as RestrictedImportsRule;
      expect(Object.keys(rule.options?.paths ?? {}).sort()).toEqual([
        'date-fns',
        'date-fns-tz',
      ]);
    }
  });
});
