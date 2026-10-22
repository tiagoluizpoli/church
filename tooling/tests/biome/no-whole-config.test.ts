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
 * Keeps the whole-config rule armed across Biome upgrades
 * (docs/agents/backend.md): runs the real GritQL rule from biome.json against
 * fixture files laid out at repo-shaped paths.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const RULE_PATH = join(REPO_ROOT, 'tooling/biome/no-whole-config.grit');
const BIOME_BIN = join(REPO_ROOT, 'node_modules/.bin/biome');

interface BiomeConfig {
  plugins: string[];
}

const config = JSON.parse(
  readFileSync(join(REPO_ROOT, 'biome.json'), 'utf8'),
) as BiomeConfig;

const CONFIG = 'interface Config { ttlMs: number }\n';

const KEEPS_FIELD = `${CONFIG}export class KeepsField {
  private readonly config: Config;
  constructor(config: Config) {
    void config;
  }
}
`;

const FIXTURES: Record<string, string> = {
  // Violations: one per fixture so each file appears once in the output.
  'apps/server/src/application/keeps-field.ts': KEEPS_FIELD,
  'apps/server/src/application/assigns-config.ts': `${CONFIG}export class AssignsConfig {
  constructor(config: Config) {
    // @ts-expect-error dynamic field without a declaration
    this.config = config;
  }
}
`,
  'apps/server/src/application/parameter-property.ts': `${CONFIG}export class ParameterProperty {
  constructor(private readonly config: Config) {}
}
`,

  // The canonical pattern: copy the values used into named fields.
  'apps/server/src/application/reads-values.ts': `${CONFIG}interface Deps { config: Config }
export class ReadsValues {
  private readonly ttlMs: number;
  constructor({ config }: Deps) {
    this.ttlMs = config.ttlMs;
  }
}
`,
  // Object literals and type members named config are not a kept field.
  'apps/server/src/application/object-literal.ts': `${CONFIG}export class BuildsDeps {
  build(config: Config) {
    return { config };
  }
}
export const literal = { config: { ttlMs: 1 } };
export type Named = { config: Config };
`,
  // A config nested inside a field's inline type, initializer or binding
  // pattern is not a kept field either.
  'apps/server/src/application/inline-type-member.ts': `${CONFIG}export class InlineTypeMember {
  private readonly opts: { config: string } = { config: 'x' };
}
`,
  'apps/server/src/application/binding-pattern.ts': `${CONFIG}export class BindingPattern {
  private readonly pick = ({ config: renamed }: { config: string }) => renamed;
}
`,
  // The rule scopes to apps/server/src only.
  'apps/web/src/features/x/keeps-field.ts': KEEPS_FIELD,
  'packages/core/src/keeps-field.ts': KEEPS_FIELD,
  'apps/server/tests/application/keeps-field.test.ts': KEEPS_FIELD,
};

let workDir = '';
let flagged: string[] = [];

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'no-whole-config-'));
  writeFileSync(
    join(workDir, 'biome.json'),
    JSON.stringify({
      plugins: [RULE_PATH],
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: { enabled: true, rules: { recommended: false } },
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
  flagged = [...output.matchAll(/^(\S+):\d+:\d+ plugin /gm)]
    .map((match) => match[1])
    .sort();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('no whole config lint rule', () => {
  it('flags a kept config in apps/server/src and nothing else', () => {
    expect(flagged).toEqual(
      [
        'apps/server/src/application/assigns-config.ts',
        'apps/server/src/application/keeps-field.ts',
        'apps/server/src/application/parameter-property.ts',
      ].sort(),
    );
  });

  it('is registered in biome.json', () => {
    expect(config.plugins).toContain('./tooling/biome/no-whole-config.grit');
  });
});
