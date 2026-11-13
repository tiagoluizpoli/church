import { randomUUID } from 'node:crypto';
import {
  invitation,
  organization,
  outboxMessage,
  runtimeConfiguration,
  session,
  user,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { count, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runOperatorCommand } from '@/scripts/operator';
import {
  type BackupTarget,
  type CapturedMessages,
  resetEnvironment,
  SERVER_APPLICATION_NAME,
} from '@/seeds/deployment/reset-environment';
import {
  seed,
  testDb,
  truncateAll,
} from '@/tests/integration/repositories/setup';

const DATABASE_URL = getIntegrationDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

const OLD_EMAIL = randomUUID();
const CHURCH_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222221';
const DELIVERY_MODE = { code: 'email_delivery_mode', value: 'both' };
const STAGING = {
  environment: 'staging',
  database: 'church_staging',
  role: 'church_staging',
};

let events: string[];
let seededUsers: number | undefined;
let backups: BackupTarget[];
let failBackup: boolean;
let mailpitReachable: boolean;

const capturedMessages: CapturedMessages = {
  assertReachable: async () => {
    events.push('mailpit-check');
    if (!mailpitReachable) throw new Error('Mailpit unreachable');
  },
  deleteAll: async () => {
    events.push('mailpit-delete');
  },
};

async function backup(target: BackupTarget): Promise<void> {
  const [users] = await testDb.select({ value: count() }).from(user);
  events.push(`backup with ${users?.value} users`);
  backups.push(target);
  if (failBackup) throw new Error('Dokploy backup failed');
}

interface RunInput {
  argv: string[];
  runtimeEnvironment?: string;
  // The database and role the connection reports; church_<runtimeEnvironment> by default.
  connectedAs?: string;
}

function run({
  argv,
  runtimeEnvironment = 'staging',
  connectedAs = `church_${runtimeEnvironment}`,
}: RunInput) {
  return resetEnvironment({
    pool,
    argv,
    connected: {
      environment: runtimeEnvironment,
      database: connectedAs,
      role: connectedAs,
    },
    backup,
    capturedMessages,
  });
}

/** Rows in every `public` table except the preserved operator configuration. */
async function applicationRows(): Promise<number> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'runtime_configuration'`,
  );
  let total = 0;
  for (const { tablename } of rows) {
    const result = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${tablename}"`,
    );
    total += result.rows[0]?.n ?? 0;
  }
  return total;
}

async function countOf(table: typeof user | typeof session) {
  const [row] = await testDb.select({ value: count() }).from(table);
  return row?.value;
}

describe('environment reset', () => {
  beforeEach(async () => {
    events = [];
    backups = [];
    failBackup = false;
    mailpitReachable = true;
    await truncateAll();
    await seed();
    seededUsers = await countOf(user);
    await testDb.insert(runtimeConfiguration).values(DELIVERY_MODE);
    await testDb.insert(session).values({
      id: 'session-1',
      token: 'token-1',
      userId: USER_ID,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      updatedAt: new Date(),
    });
    await testDb.insert(outboxMessage).values({
      churchId: CHURCH_ID,
      kind: 'notification',
      payload: {},
      status: 'processing',
      scheduledFor: new Date(),
      correlationId: OLD_EMAIL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('clean: backs up first, then empties application data, sessions and email, keeping operator configuration', async () => {
    const result = await run({
      argv: ['clean', '--environment', 'staging'],
    });

    expect(result).toEqual({
      mode: 'clean',
      environment: 'staging',
      database: 'church_staging',
    });
    expect(backups).toEqual([
      { environment: 'staging', database: 'church_staging' },
    ]);
    expect(events).toEqual([
      'mailpit-check',
      `backup with ${seededUsers} users`,
      'mailpit-delete',
    ]);
    expect(await applicationRows()).toBe(0);
    expect(await testDb.select().from(runtimeConfiguration)).toMatchObject([
      DELIVERY_MODE,
    ]);
  });

  it('clean: explicit Platform Operator setup and Church provisioning work afterward', async () => {
    await run({ argv: ['clean', '--environment', 'staging'] });

    await runOperatorCommand({
      db: testDb,
      argv: ['setup-identity', '--environment', 'staging'],
      connected: STAGING,
    });
    const provisioned = await runOperatorCommand({
      db: testDb,
      argv: [
        'provision-church',
        '--environment',
        'staging',
        '--name',
        'First Church',
        '--slug',
        'first-church',
        '--admin-email',
        'admin@first-church.test',
      ],
      connected: STAGING,
    });

    const [pending] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, provisioned?.invitationId ?? ''));
    expect(pending).toMatchObject({ role: 'admin', status: 'pending' });
    expect(await testDb.select().from(organization)).toHaveLength(1);
  });

  it('demo: replaces the data with the development seed, keeping operator configuration', async () => {
    await run({
      argv: ['demo', '--environment', 'development'],
      runtimeEnvironment: 'development',
    });

    const churches = await testDb.select().from(organization);
    expect(churches.map((church) => church.slug).sort()).toEqual(
      ['igreja-colheita', 'igreja-semente'].sort(),
    );
    expect(await countOf(session)).toBe(0);
    const [outbox] = await testDb
      .select({ value: count() })
      .from(outboxMessage)
      .where(eq(outboxMessage.correlationId, OLD_EMAIL));
    expect(outbox?.value).toBe(0);
    expect(await testDb.select().from(runtimeConfiguration)).toMatchObject([
      DELIVERY_MODE,
    ]);
  });

  describe('refuses before any backup or deletion', () => {
    it.each([
      ['production', ['clean', '--environment', 'production'], 'production'],
      ['local', ['clean', '--environment', 'local'], 'local'],
      ['an unknown environment', ['clean', '--environment', 'qa'], 'qa'],
      [
        'another environment than the connected one',
        ['clean', '--environment', 'development'],
        'staging',
      ],
      ['a missing target', ['clean'], 'staging'],
      ['an unknown mode', ['wipe', '--environment', 'staging'], 'staging'],
    ])('%s', async (_label, argv, runtimeEnvironment) => {
      await expect(run({ argv, runtimeEnvironment })).rejects.toThrow();

      expect(events).toEqual([]);
      expect(await countOf(user)).toBe(seededUsers);
      expect(await countOf(session)).toBe(1);
    });

    it.each([
      ['another environment’s database', 'church_production'],
      ['a database outside the environment naming', 'postgres'],
    ])('when the connection reaches %s despite the staging label', async (_label, connectedAs) => {
      await expect(
        run({ argv: ['clean', '--environment', 'staging'], connectedAs }),
      ).rejects.toThrow(new RegExp(`connected to database "${connectedAs}"`));

      expect(events).toEqual([]);
      expect(backups).toEqual([]);
      expect(await countOf(user)).toBe(seededUsers);
      expect(await countOf(session)).toBe(1);
    });

    it('while the server is still connected', async () => {
      const serverUrl = new URL(DATABASE_URL);
      serverUrl.searchParams.set('application_name', SERVER_APPLICATION_NAME);
      const server = new pg.Client({ connectionString: serverUrl.toString() });
      await server.connect();
      try {
        await expect(
          run({ argv: ['clean', '--environment', 'staging'] }),
        ).rejects.toThrow(/server still has 1 connection/);
      } finally {
        await server.end();
      }

      expect(events).toEqual([]);
      expect(await countOf(session)).toBe(1);
    });

    it('when Mailpit is unreachable', async () => {
      mailpitReachable = false;

      await expect(
        run({ argv: ['clean', '--environment', 'staging'] }),
      ).rejects.toThrow(/Mailpit unreachable/);

      expect(backups).toEqual([]);
      expect(await countOf(session)).toBe(1);
    });
  });

  it('leaves everything untouched when the required backup fails', async () => {
    failBackup = true;

    await expect(
      run({ argv: ['demo', '--environment', 'staging'] }),
    ).rejects.toThrow(/Dokploy backup failed/);

    expect(events).toEqual([
      'mailpit-check',
      `backup with ${seededUsers} users`,
    ]);
    expect(await countOf(user)).toBe(seededUsers);
    expect(await countOf(session)).toBe(1);
  });
});
