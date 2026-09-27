import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { ExecutionPurpose } from './run-with-purpose';

interface ServiceSchema {
  label: string;
  schemaDir: string;
}

interface CheckServiceSchemaInput extends ServiceSchema {
  purpose: ExecutionPurpose;
}

const REPO_ROOT = resolve(import.meta.dir, '../..');

const SERVICE_SCHEMAS: ServiceSchema[] = [
  { label: 'server', schemaDir: resolve(REPO_ROOT, 'apps/server') },
  { label: 'web', schemaDir: resolve(REPO_ROOT, 'apps/web') },
  { label: 'db', schemaDir: resolve(REPO_ROOT, 'packages/db') },
];

function checkServiceSchema(input: CheckServiceSchemaInput): boolean {
  try {
    execFileSync('varlock', ['load', '--path', input.schemaDir], {
      env: { ...process.env, CHURCH_EXEC_PURPOSE: input.purpose },
      stdio: 'inherit',
    });
    return true;
  } catch {
    console.error(
      `✖ ${input.label} failed validation for purpose "${input.purpose}"`,
    );
    return false;
  }
}

function main(): void {
  const purpose = (process.argv[2] ?? 'development') as ExecutionPurpose;
  const results = SERVICE_SCHEMAS.map((service) =>
    checkServiceSchema({ ...service, purpose }),
  );

  if (results.some((ok) => !ok)) {
    process.exit(1);
  }
}

main();
