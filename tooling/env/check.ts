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
  { label: 'auth', schemaDir: resolve(REPO_ROOT, 'packages/auth') },
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

interface ParseArgsInput {
  argv: string[];
}

interface ParsedArgs {
  purpose: ExecutionPurpose;
  labels: string[] | undefined;
}

const SERVICES_FLAG_PREFIX = '--services=';

export function parseArgs(input: ParseArgsInput): ParsedArgs {
  const purpose = (input.argv[0] ?? 'development') as ExecutionPurpose;
  const servicesFlag = input.argv.find((arg) =>
    arg.startsWith(SERVICES_FLAG_PREFIX),
  );
  const labels = servicesFlag
    ? servicesFlag.slice(SERVICES_FLAG_PREFIX.length).split(',')
    : undefined;

  return { purpose, labels };
}

function main(): void {
  const { purpose, labels } = parseArgs({ argv: process.argv.slice(2) });
  const services = labels
    ? SERVICE_SCHEMAS.filter((service) => labels.includes(service.label))
    : SERVICE_SCHEMAS;
  const results = services.map((service) =>
    checkServiceSchema({ ...service, purpose }),
  );

  if (results.some((ok) => !ok)) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
