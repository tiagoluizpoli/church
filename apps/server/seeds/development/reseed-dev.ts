import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDevelopmentDatabaseUrl } from '@church/db/development-database-url';
import { addCalendarDays, type CalendarDay, now } from '@church/time';
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
const BLUEPRINT_LOCATION = 'apps/server/seeds/blueprints/directory/';
// db:bootstrap's bucket code, run as its CLI: the server project cannot import tooling/.
const ENSURE_BUCKET_SCRIPT = fileURLToPath(
  new URL('../../../../tooling/worktree/storage-buckets.ts', import.meta.url),
);

function report({ message }: ReseedReportInput): void {
  console.log(`${COMMAND} ${message}`);
}

interface ReportSeededGraphInput {
  seeded: DevelopmentRecipeResult;
}

function reportSeededGraph({ seeded }: ReportSeededGraphInput): void {
  report({
    message: `complete: Churches ${seeded.church.slug} and ${seeded.secondChurch.slug}, anchor ${seeded.anchor}.`,
  });
  const width = Math.max(
    ...seeded.keyPersonas.map(({ label }) => label.length),
  );
  for (const persona of seeded.keyPersonas) {
    console.log(`  ${persona.label.padEnd(width)}  ${persona.email}`);
  }
  console.log(`  ${'Password'.padEnd(width)}  ${SEED_PERSONA_PASSWORD}`);
  console.log(`  Every other sign-in: ${BLUEPRINT_LOCATION}`);
  const { startDate, endDate } = seeded.historicalCycle;
  console.log(
    `  History: sent Cycle ${startDate} to ${endDate}; from ${addCalendarDays({ day: endDate, days: 1 })} on, nothing is planned except the sent Cycle two months after the anchor's (availability asked and confirmed by everyone, nothing assigned; sign in as the ChurchAdmin).`,
  );
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
    databaseUrl = getDevelopmentDatabaseUrl();
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
  const { env } = await import('@church/env/server');
  const { S3ObjectStorage } = await import(
    '../../src/infrastructure/storage/s3-object-storage'
  );
  const objectStorage = new S3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicUrl: env.STORAGE_PUBLIC_URL,
  });
  // A checkout bootstrapped before #1014 has no bucket; the load uploads the seeded logo.
  const bucket = spawnSync('bun', [ENSURE_BUCKET_SCRIPT, env.S3_BUCKET], {
    encoding: 'utf8',
    env: { ...process.env, S3_ENDPOINT: env.S3_ENDPOINT },
  });
  if (bucket.status !== 0) {
    throw new Error(
      `could not ensure bucket ${env.S3_BUCKET}: ${bucket.stderr || bucket.stdout}`,
    );
  }
  report({ message: `bucket ${env.S3_BUCKET}: ready, public/* readable` });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const seeded = await runReseedPhases({
      phases: createDevelopmentReseedPhases({ pool, anchor, objectStorage }),
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
