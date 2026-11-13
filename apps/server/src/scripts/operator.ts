import { NotFoundError } from '@church/core';
import { createDb, type TenancyWriter, user } from '@church/db';
import { eq } from 'drizzle-orm';
import {
  ensurePlatformOperator,
  PLATFORM_OPERATOR_EMAIL,
  type PlatformOperator,
} from './ensure-platform-operator';
import {
  type ProvisionChurchResult,
  provisionChurch,
} from './provision-church';

const OPERATOR_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type OperatorEnvironment = (typeof OPERATOR_ENVIRONMENTS)[number];

const USAGE = [
  'Usage:',
  '  operator setup-identity --environment <env>',
  '  operator provision-church --environment <env> --name <name> --slug <slug> --admin-email <email> [--base-url <url>]',
].join('\n');

export interface RunOperatorCommandInput {
  db: TenancyWriter;
  argv: string[];
  /** The environment this process is actually connected to (CHURCH_ENVIRONMENT). */
  runtimeEnvironment: string;
}

interface ParseFlagsInput {
  argv: string[];
}

function parseFlags({ argv }: ParseFlagsInput): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg?.startsWith('--') && value !== undefined) {
      flags.set(arg.slice(2), value);
    }
  }
  return flags;
}

interface RequireFlagsInput {
  flags: Map<string, string>;
  names: string[];
}

function requireFlags({ flags, names }: RequireFlagsInput): string[] {
  const missing = names.filter((name) => !flags.get(name));
  if (missing.length > 0) {
    throw new Error(
      `Missing required input: ${missing.map((name) => `--${name}`).join(', ')}\n${USAGE}`,
    );
  }
  return names.map((name) => flags.get(name) as string);
}

interface AssertTargetInput {
  requested: string;
  runtimeEnvironment: string;
}

/** Refuses before any write: the named target must be a deployable environment and be the one this process is connected to. */
function assertTarget({
  requested,
  runtimeEnvironment,
}: AssertTargetInput): OperatorEnvironment {
  if (!OPERATOR_ENVIRONMENTS.includes(requested as OperatorEnvironment)) {
    throw new Error(
      `Refusing target "${requested}": expected one of ${OPERATOR_ENVIRONMENTS.join(', ')}.`,
    );
  }
  if (requested !== runtimeEnvironment) {
    throw new Error(
      `Refusing target "${requested}": this process is connected to "${runtimeEnvironment}".`,
    );
  }
  return requested as OperatorEnvironment;
}

/**
 * Explicit Platform Operator commands. Nothing runs these on deployment or
 * startup; an operator invokes them against the environment they name.
 */
export async function runOperatorCommand({
  db,
  argv,
  runtimeEnvironment,
}: RunOperatorCommandInput): Promise<ProvisionChurchResult | undefined> {
  const [command, ...rest] = argv;
  const flags = parseFlags({ argv: rest });

  if (command === 'setup-identity') {
    const [requested] = requireFlags({ flags, names: ['environment'] });
    assertTarget({ requested: requested as string, runtimeEnvironment });
    const operator = await ensurePlatformOperator({ db });
    console.log(`Platform Operator identity ready: ${operator.id}`);
    return undefined;
  }

  if (command === 'provision-church') {
    const [requested, churchName, churchSlug, adminEmail] = requireFlags({
      flags,
      names: ['environment', 'name', 'slug', 'admin-email'],
    }) as [string, string, string, string];
    assertTarget({ requested, runtimeEnvironment });

    const operator = await ensurePlatformOperatorExisting({ db });
    return await provisionChurch({
      db,
      churchName,
      churchSlug,
      adminEmail,
      operatorUserId: operator.id,
      baseUrl: flags.get('base-url'),
    });
  }

  throw new Error(`Unknown command "${command ?? ''}".\n${USAGE}`);
}

interface EnsurePlatformOperatorExistingInput {
  db: TenancyWriter;
}

/** Provisioning never creates the identity implicitly: setup is its own explicit step. */
async function ensurePlatformOperatorExisting({
  db,
}: EnsurePlatformOperatorExistingInput): Promise<PlatformOperator> {
  const operator = await db.query.user.findFirst({
    where: eq(user.email, PLATFORM_OPERATOR_EMAIL),
  });
  if (!operator) {
    throw new NotFoundError(
      'Platform Operator identity not set up: run "operator setup-identity" first.',
    );
  }
  return operator;
}

if (import.meta.main) {
  const { env } = await import('@church/env/server');
  runOperatorCommand({
    db: createDb(),
    argv: process.argv.slice(2),
    runtimeEnvironment: env.CHURCH_ENVIRONMENT,
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
