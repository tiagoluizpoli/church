import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { buildValidationSteps } from '../../validation/affected';
import {
  CRITICAL_SMOKE_SPEC_PATHS,
  JOURNEY_MAP,
} from '../../validation/journey-map';
import {
  discoverPlaywrightSpecPaths,
  getJourneyMapFailures,
} from '../../validation/journey-map-guard';
import { hasFailure, runLanes } from '../../validation/run-lanes';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

const A = 'tests/identity/a.spec.ts';
const B = 'tests/scheduling/b.spec.ts';
const NESTED = 'tests/scheduling/deep/nested/c.spec.ts';

const mapping = (...specPaths: string[]) => ({
  sourcePathPrefix: 'apps/web/src/',
  specPaths,
});

describe('journey map guard', () => {
  it('accepts specs referenced by the journey map', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A, B],
        journeyMap: [mapping(A), mapping(B)],
        criticalSmokeSpecPaths: [],
      }),
    ).toEqual([]);
  });

  it('accepts a spec referenced only by the critical smoke set', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A, B],
        journeyMap: [mapping(A)],
        criticalSmokeSpecPaths: [B],
      }),
    ).toEqual([]);
  });

  it('accepts repeated references and overlap between the lists', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A],
        journeyMap: [mapping(A, A), mapping(A)],
        criticalSmokeSpecPaths: [A, A],
      }),
    ).toEqual([]);
  });

  it('reports a nested spec missing from both lists', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A, NESTED],
        journeyMap: [mapping(A)],
        criticalSmokeSpecPaths: [],
      }),
    ).toEqual([
      `${NESTED}: unmapped Playwright spec: add it to JOURNEY_MAP or CRITICAL_SMOKE_SPEC_PATHS in tooling/validation/journey-map.ts`,
    ]);
  });

  it('reports a stale journey-map reference with its source prefix', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A],
        journeyMap: [mapping(A, B)],
        criticalSmokeSpecPaths: [],
      }),
    ).toEqual([
      `${B}: stale JOURNEY_MAP reference (sourcePathPrefix apps/web/src/): no such Playwright spec under apps/web/tests/`,
    ]);
  });

  it('reports a stale critical smoke reference', () => {
    expect(
      getJourneyMapFailures({
        specPaths: [A],
        journeyMap: [mapping(A)],
        criticalSmokeSpecPaths: [B],
      }),
    ).toEqual([
      `${B}: stale CRITICAL_SMOKE_SPEC_PATHS reference: no such Playwright spec under apps/web/tests/`,
    ]);
  });

  it('reports both sides of an unrepaired rename and passes once repaired', () => {
    const renamed = 'tests/identity/a-renamed.spec.ts';
    expect(
      getJourneyMapFailures({
        specPaths: [renamed],
        journeyMap: [mapping(A)],
        criticalSmokeSpecPaths: [],
      }),
    ).toEqual([
      `${renamed}: unmapped Playwright spec: add it to JOURNEY_MAP or CRITICAL_SMOKE_SPEC_PATHS in tooling/validation/journey-map.ts`,
      `${A}: stale JOURNEY_MAP reference (sourcePathPrefix apps/web/src/): no such Playwright spec under apps/web/tests/`,
    ]);
    expect(
      getJourneyMapFailures({
        specPaths: [renamed],
        journeyMap: [mapping(renamed)],
        criticalSmokeSpecPaths: [],
      }),
    ).toEqual([]);
  });

  it('rejects references to files that are not discovered specs', () => {
    const helper = 'tests/identity/helpers.ts';
    const unit = 'tests/identity/a.component.test.tsx';
    expect(
      getJourneyMapFailures({
        specPaths: [A],
        journeyMap: [mapping(A, helper)],
        criticalSmokeSpecPaths: [unit],
      }),
    ).toEqual([
      `${helper}: stale JOURNEY_MAP reference (sourcePathPrefix apps/web/src/): no such Playwright spec under apps/web/tests/`,
      `${unit}: stale CRITICAL_SMOKE_SPEC_PATHS reference: no such Playwright spec under apps/web/tests/`,
    ]);
  });

  it('lists every failure once, in stable order regardless of input order', () => {
    const input = {
      specPaths: [NESTED, B, A],
      journeyMap: [
        mapping('tests/z.spec.ts', A),
        mapping('tests/m.spec.ts', 'tests/z.spec.ts'),
      ],
      criticalSmokeSpecPaths: ['tests/y.spec.ts', 'tests/y.spec.ts'],
    };
    const failures = getJourneyMapFailures(input);
    expect(failures).toEqual([
      `${B}: unmapped Playwright spec: add it to JOURNEY_MAP or CRITICAL_SMOKE_SPEC_PATHS in tooling/validation/journey-map.ts`,
      `${NESTED}: unmapped Playwright spec: add it to JOURNEY_MAP or CRITICAL_SMOKE_SPEC_PATHS in tooling/validation/journey-map.ts`,
      'tests/m.spec.ts: stale JOURNEY_MAP reference (sourcePathPrefix apps/web/src/): no such Playwright spec under apps/web/tests/',
      'tests/z.spec.ts: stale JOURNEY_MAP reference (sourcePathPrefix apps/web/src/): no such Playwright spec under apps/web/tests/',
      'tests/y.spec.ts: stale CRITICAL_SMOKE_SPEC_PATHS reference: no such Playwright spec under apps/web/tests/',
    ]);
    expect(
      getJourneyMapFailures({
        ...input,
        specPaths: [...input.specPaths].reverse(),
        journeyMap: [...input.journeyMap].reverse(),
      }),
    ).toEqual(failures);
  });
});

const SCRIPT_PATH = join(
  import.meta.dir,
  '../../validation/journey-map-guard.ts',
);
const REFERENCED_SPEC_PATHS = [
  ...new Set([
    ...JOURNEY_MAP.flatMap(({ specPaths }) => specPaths),
    ...CRITICAL_SMOKE_SPEC_PATHS,
  ]),
];

describe('journey map guard command', () => {
  let webRoot: string;

  const writeWebFile = (path: string) => {
    mkdirSync(dirname(join(webRoot, path)), { recursive: true });
    writeFileSync(join(webRoot, path), '');
  };

  const runGuard = (root = webRoot) => {
    const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--web-root', root], {
      stderr: 'pipe',
      stdout: 'pipe',
    });
    return { exitCode: result.exitCode, stderr: result.stderr.toString() };
  };

  beforeEach(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'journey-map-guard-test-'));
    for (const path of REFERENCED_SPEC_PATHS) writeWebFile(path);
    // Supporting and non-Playwright files never need journey metadata.
    for (const path of [
      'tests/identity/helpers.ts',
      'tests/fixtures/auth.setup.ts',
      'tests/components/x.component.test.tsx',
      'tests/lib/x.test.ts',
      'tests/scheduling/x.spec.tsx',
    ]) {
      writeWebFile(path);
    }
  });

  afterEach(() => {
    rmSync(webRoot, { force: true, recursive: true });
  });

  it('discovers nested specs as web-root-relative tests/ paths', () => {
    writeWebFile('tests/a/b/c/deep.spec.ts');
    expect(discoverPlaywrightSpecPaths({ webRoot })).toEqual(
      [...REFERENCED_SPEC_PATHS, 'tests/a/b/c/deep.spec.ts'].sort(),
    );
  });

  it('exits successfully when every spec is referenced', () => {
    expect(runGuard()).toEqual({ exitCode: 0, stderr: '' });
  });

  it('exits nonzero listing an unmapped nested spec and a stale reference', () => {
    const [stale] = CRITICAL_SMOKE_SPEC_PATHS as [string];
    rmSync(join(webRoot, stale));
    writeWebFile('tests/a/b/c/deep.spec.ts');
    const { exitCode, stderr } = runGuard();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'tests/a/b/c/deep.spec.ts: unmapped Playwright spec',
    );
    expect(stderr).toContain(
      `${stale}: stale CRITICAL_SMOKE_SPEC_PATHS reference`,
    );
  });

  it('fails explicitly when the tests root is missing', () => {
    rmSync(join(webRoot, 'tests'), { force: true, recursive: true });
    const { exitCode, stderr } = runGuard();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      `cannot read Playwright specs under ${join(webRoot, 'tests')}`,
    );
  });
});

describe('journey map repository contract', () => {
  it('references every Playwright spec in apps/web/tests and nothing else', () => {
    expect(
      getJourneyMapFailures({
        specPaths: discoverPlaywrightSpecPaths(),
        journeyMap: JOURNEY_MAP,
        criticalSmokeSpecPaths: CRITICAL_SMOKE_SPEC_PATHS,
      }),
    ).toEqual([]);
  });
});

describe('journey map guard in standard validation', () => {
  const rootScripts: Record<string, string> = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  ).scripts;

  it('is a required step of root lint', () => {
    expect(rootScripts.lint?.split(' && ')).toContain(
      'bun run validate:journey-map',
    );
  });

  it('fails affected validation of a Playwright-test-only change that drifts', async () => {
    // A minimal repository: the real guard, metadata and root script, plus one
    // new spec nobody mapped.
    const root = mkdtempSync(join(tmpdir(), 'journey-map-lane-test-'));
    try {
      for (const file of ['journey-map-guard.ts', 'journey-map.ts']) {
        mkdirSync(join(root, 'tooling/validation'), { recursive: true });
        copyFileSync(
          join(REPO_ROOT, 'tooling/validation', file),
          join(root, 'tooling/validation', file),
        );
      }
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'validate:journey-map': rootScripts['validate:journey-map'],
          },
        }),
      );
      for (const path of [...REFERENCED_SPEC_PATHS, 'tests/new.spec.ts']) {
        mkdirSync(dirname(join(root, 'apps/web', path)), { recursive: true });
        writeFileSync(join(root, 'apps/web', path), '');
      }
      const { checkLane } = buildValidationSteps({
        onlyE2e: false,
        plan: {
          e2eSpecPaths: ['tests/new.spec.ts'],
          journeySelectionReasons: [],
          lintPaths: [],
          missingJourneyMappings: [],
          requiresFullE2e: false,
          testLayerSelectionReasons: [],
          testLayers: [],
          testTargets: [],
          toolingTestPaths: [],
          workspaceNames: [],
          workspaceSelectionReasons: [],
        },
        skipE2e: true,
      });
      const stderr: string[] = [];
      const results = await runLanes({
        cwd: root,
        lanes: [checkLane.filter(({ label }) => label === 'journey-map')],
        output: {
          stderr: ({ text }) => stderr.push(text),
          stdout: () => {},
        },
      });
      expect(results.map(({ status }) => status)).toEqual(['failed']);
      expect(hasFailure({ results })).toBe(true);
      expect(stderr.join('')).toContain(
        'tests/new.spec.ts: unmapped Playwright spec',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
