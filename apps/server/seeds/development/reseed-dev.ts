import { isPrimaryWorktree } from '@church/db/development-database-reset';
import { getDevelopmentDatabaseUrl } from '@church/db/development-database-url';
import { type CalendarDay, now } from '@church/time';
import pg from 'pg';
import { SEED_PERSONA_PASSWORD } from '../blueprints/credentials';
import { DEVELOPMENT_CHURCH_TIMEZONE } from '../blueprints/development';
import type { DevelopmentRecipeResult } from '../recipes/development';
import {
  parseReseedArguments,
  type ReseedReportInput,
  reasonOf,
  resolveReseedAnchor,
  runReseedPhases,
} from './reseed';

const COMMAND = 'db:reseed:dev';

function report({ message }: ReseedReportInput): void {
  console.log(`${COMMAND} ${message}`);
}

interface ReportSeededGraphInput {
  seeded: DevelopmentRecipeResult;
}

function reportSeededGraph({ seeded }: ReportSeededGraphInput): void {
  report({
    message: `complete: Church ${seeded.church.slug}, anchor ${seeded.anchor}.`,
  });
  console.log(`  ChurchAdmin  ${seeded.personas.churchAdmin.email}`);
  console.log(`  Volunteer    ${seeded.personas.volunteer.email}`);
  console.log(`  Password     ${SEED_PERSONA_PASSWORD}`);
}

/**
 * `bun run db:reseed:dev [-- --anchor=YYYY-MM-DD]`: rebuilds this worktree's
 * development database from the development recipe. Arguments and the target
 * are settled before anything destructive runs; every refusal happens there.
 */
async function reseedDevelopmentDatabase(): Promise<void> {
  let requestedAnchor: CalendarDay | undefined;
  try {
    requestedAnchor = parseReseedArguments({
      argv: process.argv.slice(2),
    }).anchor;
  } catch (error) {
    throw new Error(`refused the arguments: ${reasonOf({ error })}`);
  }

  let databaseUrl: string;
  try {
    // Prints the redacted preflight line once the target is accepted.
    databaseUrl = getDevelopmentDatabaseUrl({ isPrimaryWorktree });
  } catch (error) {
    throw new Error(`refused the target: ${reasonOf({ error })}`);
  }

  const anchor = resolveReseedAnchor({
    anchor: requestedAnchor,
    instant: now(),
    timeZone: DEVELOPMENT_CHURCH_TIMEZONE,
  });
  report({
    message: `anchor=${anchor} timeZone=${DEVELOPMENT_CHURCH_TIMEZONE}`,
  });

  // Loaded only now: `@church/db`'s entry validates the server environment
  // and opens its own pool on import, which must never precede the refusals.
  const { createDevelopmentReseedPhases } = await import('./phases');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const seeded = await runReseedPhases({
      phases: createDevelopmentReseedPhases({ pool, anchor }),
      report,
    });
    reportSeededGraph({ seeded });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  reseedDevelopmentDatabase().catch((error: unknown) => {
    console.error(`${COMMAND} ${reasonOf({ error })}`);
    process.exitCode = 1;
  });
}
