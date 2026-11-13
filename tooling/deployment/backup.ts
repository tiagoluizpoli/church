import { parseArgs } from 'node:util';

/**
 * Operator command over Dokploy's native PostgreSQL backups (#880).
 *
 *   create --environment=<env> --database=<db>  run the environment's
 *     pre-deployment/reset backup and exit 0 only once Dokploy confirms it.
 *   check  --environment=<env> --database=<db>  verify the environment's backup
 *     configuration (production also needs its daily scheduled backup).
 *
 * Retention is Dokploy's own `keepLatestCount`, which prunes only after a
 * successful backup and only inside that backup's `<service>/<prefix>/` folder.
 * Since 0.30.0 a failed upload also deletes its partial object, so a failed
 * backup cannot displace a retained one. Each pool therefore gets its own
 * Dokploy backup with prefix `<environment>/<pool>`, which this command
 * verifies before anything runs. See docs/operations/backups.md.
 */

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type Environment = (typeof ENVIRONMENTS)[number];

type Pool = 'pre-deployment' | 'scheduled';

const RETAINED_BACKUPS_PER_POOL = 5;
const MINIMUM_DOKPLOY_VERSION = [0, 30, 0];
const DAILY_CRON = /^\d{1,2} \d{1,2} \* \* \*$/;
// Dokploy runs the backup inside the request, so allow a long dump.
const BACKUP_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const READ_REQUEST_TIMEOUT_MS = 30 * 1000;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

class BackupFailure extends Error {}

interface DokployBackup {
  backupId: string;
  database: string;
  prefix: string;
  schedule: string;
  enabled: boolean | null;
  keepLatestCount: number | null;
  databaseType: string;
  backupType: string;
}

interface DokployRequest {
  path: string;
  body?: unknown;
  timeoutMs: number;
}

interface DokployConnection {
  url: string;
  apiKey: string;
}

interface Target {
  environment: Environment;
  database: string;
}

interface ParsedCommand extends Target {
  command: 'create' | 'check';
}

interface VerifyBackupInput {
  dokploy: Dokploy;
  backupId: string;
  target: Target;
  pool: Pool;
}

class Dokploy {
  private readonly url: string;
  private readonly apiKey: string;

  constructor(connection: DokployConnection) {
    this.url = connection.url.replace(/\/+$/, '');
    this.apiKey = connection.apiKey;
  }

  async call(request: DokployRequest): Promise<unknown> {
    const { path, body, timeoutMs } = request;
    const init: RequestInit = {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let response: Response;
    try {
      response = await fetch(`${this.url}/api/${path}`, init);
    } catch (error) {
      throw new BackupFailure(
        `Dokploy ${path} did not answer: ${String(error)}`,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new BackupFailure(
        `Dokploy ${path} failed (HTTP ${response.status}): ${errorMessage(text)}`,
      );
    }
    return JSON.parse(text);
  }
}

function errorMessage(text: string): string {
  try {
    const { message } = JSON.parse(text) as { message?: unknown };
    if (typeof message === 'string') return message;
  } catch {}
  return text.slice(0, 500);
}

function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '');
}

// Unparsable versions count as too old, so an unknown install fails closed.
function isOlderThanMinimum(parts: number[]): boolean {
  for (const [index, minimum] of MINIMUM_DOKPLOY_VERSION.entries()) {
    const part = parts[index] ?? Number.NaN;
    if (Number.isNaN(part) || part < minimum) return true;
    if (part > minimum) return false;
  }
  return false;
}

async function verifyDokployVersion(dokploy: Dokploy): Promise<void> {
  const version = await dokploy.call({
    path: 'settings.getDokployVersion',
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  });
  const parts = String(version).replace(/^v/, '').split(/[.-]/).map(Number);
  const tooOld = isOlderThanMinimum(parts);
  if (tooOld) {
    throw new BackupFailure(
      `Dokploy ${version} can leave a failed backup's partial file to count against retention; ` +
        `upgrade to ${MINIMUM_DOKPLOY_VERSION.join('.')} or later.`,
    );
  }
}

async function verifyBackup(input: VerifyBackupInput): Promise<DokployBackup> {
  const { dokploy, backupId, target, pool } = input;
  const backup = (await dokploy.call({
    path: `backup.one?backupId=${encodeURIComponent(backupId)}`,
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  })) as DokployBackup;
  const expectedPrefix = `${target.environment}/${pool}`;
  const scheduled = pool === 'scheduled';
  const problems = [
    backup.databaseType !== 'postgres' || backup.backupType !== 'database'
      ? `is a ${backup.databaseType} ${backup.backupType} backup, not a postgres database backup`
      : '',
    backup.database !== target.database
      ? `backs up database "${backup.database}", not "${target.database}"`
      : '',
    normalizePrefix(backup.prefix) !== expectedPrefix
      ? `uses prefix "${backup.prefix}", not "${expectedPrefix}"`
      : '',
    backup.keepLatestCount !== RETAINED_BACKUPS_PER_POOL
      ? `keeps ${backup.keepLatestCount ?? 'all'} backups, not ${RETAINED_BACKUPS_PER_POOL}`
      : '',
    scheduled && !(backup.enabled && DAILY_CRON.test(backup.schedule))
      ? `is not an enabled daily schedule (enabled=${backup.enabled}, schedule="${backup.schedule}")`
      : '',
    !scheduled && backup.enabled
      ? 'has its schedule enabled; the pre-deployment pool must run only on demand'
      : '',
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new BackupFailure(
      `Dokploy backup ${backupId} (${pool} pool for ${target.environment}) ${problems.join('; ')}.`,
    );
  }
  console.log(
    `✔ ${pool} pool: ${target.environment}/${target.database} → prefix ${expectedPrefix}, keeps ${RETAINED_BACKUPS_PER_POOL}`,
  );
  return backup;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new BackupFailure(`Missing prerequisite: ${name} is not set.`);
  return value;
}

function parseCommand(): ParsedCommand {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { environment: { type: 'string' }, database: { type: 'string' } },
  });
  const [command] = positionals;
  const { environment, database } = values;
  if (
    (command !== 'create' && command !== 'check') ||
    !ENVIRONMENTS.includes(environment as Environment) ||
    !database
  ) {
    console.error(
      `Usage: backup.ts <create|check> --environment=<${ENVIRONMENTS.join('|')}> --database=<name>`,
    );
    process.exit(EXIT_USAGE);
  }
  return { command, environment: environment as Environment, database };
}

async function main(): Promise<void> {
  const { command, ...target } = parseCommand();
  const dokploy = new Dokploy({
    url: requiredEnv('DOKPLOY_URL'),
    apiKey: requiredEnv('DOKPLOY_API_KEY'),
  });
  const backupId = requiredEnv('CHURCH_BACKUP_ID');
  const scheduledBackupId = process.env.CHURCH_SCHEDULED_BACKUP_ID;

  await verifyDokployVersion(dokploy);
  await verifyBackup({ dokploy, backupId, target, pool: 'pre-deployment' });

  if (command === 'check') {
    if (target.environment !== 'production') {
      if (scheduledBackupId) {
        throw new BackupFailure(
          `${target.environment} has no scheduled backup cadence; unset CHURCH_SCHEDULED_BACKUP_ID.`,
        );
      }
      return;
    }
    if (!scheduledBackupId) {
      throw new BackupFailure(
        'Missing prerequisite: CHURCH_SCHEDULED_BACKUP_ID is not set.',
      );
    }
    await verifyBackup({
      dokploy,
      backupId: scheduledBackupId,
      target,
      pool: 'scheduled',
    });
    return;
  }

  console.log(`Backing up ${target.environment}/${target.database}…`);
  const confirmed = await dokploy.call({
    path: 'backup.manualBackupPostgres',
    body: { backupId },
    timeoutMs: BACKUP_REQUEST_TIMEOUT_MS,
  });
  if (confirmed !== true) {
    throw new BackupFailure(
      `Dokploy did not confirm the backup: ${JSON.stringify(confirmed)}`,
    );
  }
  console.log(
    `✔ Backup of ${target.environment}/${target.database} confirmed by Dokploy.`,
  );
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(EXIT_FAILURE);
});
