import { type CalendarDay, parseCalendarDay } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import type { E2eJourneyRecipeName } from '../../seeds/e2e/journey-keys';
import {
  type E2eJourneyRecipe,
  runE2eJourneyRecipe,
} from '../../seeds/e2e/journey-recipe';
import { E2E_JOURNEY_RECIPES } from '../../seeds/e2e/journey-recipes';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import {
  countAllRows,
  type GraphSnapshot,
  rowsMentioning,
  snapshotAllRows,
} from './journey-graph-snapshot';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
const RECIPE_NAMES = Object.keys(E2E_JOURNEY_RECIPES) as E2eJourneyRecipeName[];

interface JourneyKeyInput {
  recipeName: E2eJourneyRecipeName;
  journeyKey: string;
}

async function createRecipe({
  recipeName,
  journeyKey,
}: JourneyKeyInput): Promise<E2eJourneyRecipe<unknown>> {
  const factory = await E2E_JOURNEY_RECIPES[recipeName]();
  return factory({ journeyKey, anchor: ANCHOR });
}

async function loadJourney({
  recipeName,
  journeyKey,
}: JourneyKeyInput): Promise<unknown> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: await createRecipe({ recipeName, journeyKey }),
  });
}

interface RootIdsOfInput {
  recipe: E2eJourneyRecipe<unknown>;
}

function rootIdsOf({ recipe }: RootIdsOfInput): string[] {
  return [...recipe.roots.churchIds, ...recipe.roots.userIds];
}

describe.each(RECIPE_NAMES)('journey recipe contract: %s', (recipeName) => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({
      db: testDb,
      id: SEED_PLATFORM_OPERATOR_ID,
    });
  });

  it('reloading a key yields an identical whole-database snapshot', async () => {
    await loadJourney({ recipeName, journeyKey: 'alpha' });
    const first = await snapshotAllRows();

    await loadJourney({ recipeName, journeyKey: 'alpha' });

    expect(await snapshotAllRows()).toEqual(first);
  });

  it('purging its roots restores every table to the pre-load row count', async () => {
    const baseline = await countAllRows();
    await loadJourney({ recipeName, journeyKey: 'alpha' });
    expect(await countAllRows()).not.toEqual(baseline);

    const purgeOnly: E2eJourneyRecipe<null> = {
      ...(await createRecipe({ recipeName, journeyKey: 'alpha' })),
      async load() {
        return null;
      },
    };
    await runE2eJourneyRecipe({ db: testDb, recipe: purgeOnly });

    expect(await countAllRows()).toEqual(baseline);
  });

  it('gives two keys disjoint graphs and reloading one leaves the other identical', async () => {
    const alpha = await createRecipe({ recipeName, journeyKey: 'alpha' });
    const beta = await createRecipe({ recipeName, journeyKey: 'beta' });
    await loadJourney({ recipeName, journeyKey: 'alpha' });
    await loadJourney({ recipeName, journeyKey: 'beta' });
    const snapshot = await snapshotAllRows();
    const alphaRows = rowsMentioning({
      snapshot,
      ids: rootIdsOf({ recipe: alpha }),
    });
    const betaRows = rowsMentioning({
      snapshot,
      ids: rootIdsOf({ recipe: beta }),
    });

    expect(rootIdsOf({ recipe: alpha })).not.toEqual(
      rootIdsOf({ recipe: beta }),
    );
    for (const id of rootIdsOf({ recipe: alpha })) {
      expect(rootIdsOf({ recipe: beta })).not.toContain(id);
    }
    expect(Object.keys(alphaRows).length).toBeGreaterThan(0);
    const sharedRows = Object.keys(alphaRows).flatMap((table) =>
      (alphaRows[table] ?? []).filter((row) =>
        (betaRows[table] ?? []).includes(row),
      ),
    );
    expect(sharedRows).toEqual([]);

    await loadJourney({ recipeName, journeyKey: 'alpha' });

    const after = await snapshotAllRows();
    expect(
      rowsMentioning({ snapshot: after, ids: rootIdsOf({ recipe: beta }) }),
    ).toEqual(betaRows);
    expect(after).toEqual(snapshot);
  });

  it('rolls a failing reload back, leaving the previous graph intact', async () => {
    await loadJourney({ recipeName, journeyKey: 'alpha' });
    const before = await snapshotAllRows();
    const real = await createRecipe({ recipeName, journeyKey: 'alpha' });
    const failing: E2eJourneyRecipe<never> = {
      ...real,
      async load(input) {
        await real.load(input);
        throw new Error('journey recipe failed after loading');
      },
    };

    await expect(
      runE2eJourneyRecipe({ db: testDb, recipe: failing }),
    ).rejects.toThrow('journey recipe failed after loading');

    const after: GraphSnapshot = await snapshotAllRows();
    expect(after).toEqual(before);
  });

  it("names roots only the journey key's own graph can own", async () => {
    const alpha = await createRecipe({ recipeName, journeyKey: 'alpha' });
    const sameKey = await createRecipe({ recipeName, journeyKey: 'alpha' });
    const beta = await createRecipe({ recipeName, journeyKey: 'beta' });

    expect(alpha.name).toBe(recipeName);
    expect(alpha.roots).toEqual(sameKey.roots);
    expect(alpha.roots.churchIds.length).toBeGreaterThan(0);
    for (const id of rootIdsOf({ recipe: alpha })) {
      expect(rootIdsOf({ recipe: beta })).not.toContain(id);
      expect(id).not.toBe(SEED_PLATFORM_OPERATOR_ID);
    }
  });
});
