import { getE2eDatabaseUrl } from '@church/db/e2e-database-url';
import { now, today } from '@church/time';
import {
  E2E_JOURNEY_TIMEZONE,
  type E2eJourneyRecipeName,
} from './journey-keys';
import { E2E_JOURNEY_RECIPES } from './journey-recipes';

const USAGE = 'Usage: load-journey-recipe <recipe-name> --key=<journeyKey>';
const KEY_FLAG = '--key=';

function isRecipeName(name: string): name is E2eJourneyRecipeName {
  return Object.hasOwn(E2E_JOURNEY_RECIPES, name);
}

interface ParseLoaderArgumentsInput {
  argv: string[];
}

interface LoaderArguments {
  recipeName: E2eJourneyRecipeName;
  journeyKey: string;
}

function parseLoaderArguments({
  argv,
}: ParseLoaderArgumentsInput): LoaderArguments {
  const recipeName = argv.find((arg) => !arg.startsWith('--'));
  const journeyKey = argv
    .find((arg) => arg.startsWith(KEY_FLAG))
    ?.slice(KEY_FLAG.length);
  if (!recipeName || !journeyKey) {
    throw new Error(USAGE);
  }
  if (!isRecipeName(recipeName)) {
    throw new Error(
      `Unknown recipe "${recipeName}". Known: ${Object.keys(E2E_JOURNEY_RECIPES).join(', ')}`,
    );
  }
  return { recipeName, journeyKey };
}

async function loadJourneyRecipe(): Promise<void> {
  const { recipeName, journeyKey } = parseLoaderArguments({
    argv: process.argv.slice(2),
  });

  // Refuses every target but the E2E database, and prints the redacted
  // preflight line, before `@church/db` is imported or any pool exists.
  getE2eDatabaseUrl();

  // The entry's own `db` resolves that same E2E target: one pool, tables-only
  // schema.
  const { db } = await import('@church/db');
  const { runE2eJourneyRecipe } = await import('./journey-recipe');
  try {
    const createRecipe = await E2E_JOURNEY_RECIPES[recipeName]();
    const anchor = today({ instant: now(), timeZone: E2E_JOURNEY_TIMEZONE });
    const result = await runE2eJourneyRecipe({
      db,
      recipe: createRecipe({ journeyKey, anchor }),
    });
    console.log(JSON.stringify(result));
  } finally {
    await db.$client.end();
  }
}

if (import.meta.main) {
  loadJourneyRecipe().catch((error: unknown) => {
    console.error('[e2e-journey-recipe] failed:', error);
    process.exit(1);
  });
}
