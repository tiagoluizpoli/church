import { join } from 'node:path';
import {
  DeploymentPreflightFailure,
  runDeploymentPreflights,
} from '../deployment-preflight';

// Runs in the deployed `migrate` service before drizzle-kit migrate.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ Missing prerequisite: DATABASE_URL is not set.');
  process.exit(1);
}
const migrationsFolder = join(import.meta.dirname, '../migrations');

try {
  const results = await runDeploymentPreflights({
    databaseUrl,
    migrationsFolder,
  });
  for (const result of results) console.log(`✔ ${result}`);
} catch (error) {
  if (!(error instanceof DeploymentPreflightFailure)) throw error;
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
