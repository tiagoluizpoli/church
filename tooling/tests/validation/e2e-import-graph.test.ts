import { describe, expect, it } from 'bun:test';
import { classifyChanges } from '../../validation/affected-plan';
import {
  readE2eImportGraph,
  selectSpecsReaching,
} from '../../validation/e2e-import-graph';
import { CRITICAL_SMOKE_SPEC_PATHS } from '../../validation/journey-map';

const FIXTURE = 'apps/web/tests/fixtures/a.ts';
const INNER = 'apps/web/tests/fixtures/inner.ts';
const SPEC = 'apps/web/tests/scheduling/one.spec.ts';
const SPEC_FROM_WEB = 'tests/scheduling/one.spec.ts';

// graph maps a file to the files it imports
const directGraph = { [SPEC]: [FIXTURE] };
const transitiveGraph = { [SPEC]: [FIXTURE], [FIXTURE]: [INNER] };

describe('readE2eImportGraph and selectSpecsReaching', () => {
  const graph = readE2eImportGraph();

  it('reaches a spec through the real graph from a journey fixture', () => {
    expect(
      selectSpecsReaching({
        changedPath: 'apps/web/tests/fixtures/journeys/schedule-publish.ts',
        graph,
      }),
    ).toContain('tests/scheduling/us4-schedule-publish.spec.ts');
  });

  it('resolves both @/tests and relative imports', () => {
    expect(
      graph['apps/web/tests/fixtures/journeys/schedule-publish.ts'],
    ).toEqual(
      expect.arrayContaining([
        'apps/web/tests/fixtures/journeys/assign-church.ts',
        'apps/web/tests/fixtures/journey-recipes.ts',
      ]),
    );
  });

  it('terminates on an import cycle', () => {
    expect(
      selectSpecsReaching({
        changedPath: FIXTURE,
        graph: {
          [FIXTURE]: [INNER],
          [INNER]: [FIXTURE, SPEC],
          [SPEC]: [FIXTURE],
        },
      }),
    ).toEqual([SPEC_FROM_WEB]);
  });
});

describe('classifyChanges with an e2e import graph', () => {
  it('selects the spec importing a fixture directly, with a fixture reason', () => {
    const plan = classifyChanges({
      changedPaths: [FIXTURE],
      e2eImportGraph: directGraph,
    });

    expect(plan.e2eSpecPaths).toEqual([SPEC_FROM_WEB]);
    expect(plan.journeySelectionReasons).toEqual([
      {
        changedPath: FIXTURE,
        detail: `fixture:${FIXTURE}`,
        specPath: SPEC_FROM_WEB,
      },
    ]);
  });

  it('selects the spec at the end of a transitive chain, naming the changed file', () => {
    const plan = classifyChanges({
      changedPaths: [INNER],
      e2eImportGraph: transitiveGraph,
    });

    expect(plan.e2eSpecPaths).toEqual([SPEC_FROM_WEB]);
    expect(plan.journeySelectionReasons[0]?.detail).toBe(`fixture:${INNER}`);
  });

  it('selects nothing, with no smoke fallback or missing mapping, for an unreached fixture', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/tests/fixtures/orphan.ts'],
      e2eImportGraph: directGraph,
    });

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(plan.missingJourneyMappings).toEqual([]);
    expect(plan.e2eSpecPaths).not.toEqual(
      expect.arrayContaining([...CRITICAL_SMOKE_SPEC_PATHS]),
    );
  });

  it('selects a changed spec itself', () => {
    const plan = classifyChanges({
      changedPaths: [SPEC],
      e2eImportGraph: {},
    });

    expect(plan.e2eSpecPaths).toEqual([SPEC_FROM_WEB]);
  });

  it('selects the same specs under the daily gate without a full run', () => {
    const direct = classifyChanges({
      changedPaths: [FIXTURE],
      dailyGate: true,
      e2eImportGraph: transitiveGraph,
    });
    const transitive = classifyChanges({
      changedPaths: [INNER],
      dailyGate: true,
      e2eImportGraph: transitiveGraph,
    });

    expect(direct.e2eSpecPaths).toEqual(transitive.e2eSpecPaths);
    expect(direct.e2eSpecPaths).toEqual([SPEC_FROM_WEB]);
    expect(direct.requiresFullE2e).toBe(false);
    expect(transitive.requiresFullE2e).toBe(false);
  });

  it('selects nothing for a deleted fixture', () => {
    const plan = classifyChanges({
      changedPaths: [FIXTURE],
      deletedPaths: [FIXTURE],
      e2eImportGraph: directGraph,
    });

    expect(plan.e2eSpecPaths).toEqual([]);
  });
});
