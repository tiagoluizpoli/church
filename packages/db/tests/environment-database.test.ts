import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { provisionEnvironmentDatabase } from '../src/environment-database';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';
import { scratchDatabaseName } from '../src/scratch-database-name';

const STAGING = scratchDatabaseName({ purpose: 'env_staging', kind: 'int' });
const PRODUCTION = scratchDatabaseName({
  purpose: 'env_production',
  kind: 'int',
});
const STAGING_PASSWORD = 'staging-password';
const PRODUCTION_PASSWORD = 'production-password';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PASSWORD = '28P01';

const integrationDatabaseUrl = getIntegrationDatabaseUrl();

interface UrlInput {
  database: string;
  user?: string;
  password?: string;
}

function urlFor({ database, user, password }: UrlInput): string {
  const url = new URL(integrationDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  if (user) url.username = user;
  if (password) url.password = password;
  return url.toString();
}

const adminUrl = urlFor({ database: 'postgres' });

interface ConnectAsInput {
  role: string;
  password: string;
  database: string;
}

interface QueryAsInput extends ConnectAsInput {
  sql: string;
}

async function queryAs(input: QueryAsInput): Promise<pg.QueryResult> {
  const client = new pg.Client({
    connectionString: urlFor({
      database: input.database,
      user: input.role,
      password: input.password,
    }),
  });
  await client.connect();
  try {
    return await client.query(input.sql);
  } finally {
    await client.end();
  }
}

async function errorCode(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

async function provisionBoth(): Promise<void> {
  await provisionEnvironmentDatabase({
    adminUrl,
    name: STAGING,
    password: STAGING_PASSWORD,
  });
  await provisionEnvironmentDatabase({
    adminUrl,
    name: PRODUCTION,
    password: PRODUCTION_PASSWORD,
  });
}

afterAll(async () => {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const name of [STAGING, PRODUCTION]) {
      const identifier = admin.escapeIdentifier(name);
      await admin.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${identifier}`);
    }
  } finally {
    await admin.end();
  }
});

describe('environment databases on a shared PostgreSQL instance', () => {
  it('lets each environment role build its own schema', async () => {
    await provisionBoth();

    await queryAs({
      role: STAGING,
      password: STAGING_PASSWORD,
      database: STAGING,
      sql: 'CREATE TABLE IF NOT EXISTS migrated (id int)',
    });
    const owner = await queryAs({
      role: STAGING,
      password: STAGING_PASSWORD,
      database: STAGING,
      sql: "SELECT tableowner FROM pg_tables WHERE tablename = 'migrated'",
    });

    expect(owner.rows).toEqual([{ tableowner: STAGING }]);
  });

  it('refuses each environment role a connection to the other environment', async () => {
    await provisionBoth();

    const stagingIntoProduction = await errorCode(
      queryAs({
        role: STAGING,
        password: STAGING_PASSWORD,
        database: PRODUCTION,
        sql: 'SELECT 1',
      }),
    );
    const productionIntoStaging = await errorCode(
      queryAs({
        role: PRODUCTION,
        password: PRODUCTION_PASSWORD,
        database: STAGING,
        sql: 'SELECT 1',
      }),
    );

    expect(stagingIntoProduction).toBe(INSUFFICIENT_PRIVILEGE);
    expect(productionIntoStaging).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('gives the role no server-wide privilege or membership', async () => {
    await provisionBoth();

    const role = await queryAs({
      role: STAGING,
      password: STAGING_PASSWORD,
      database: STAGING,
      sql: `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
              (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships
            FROM pg_roles r WHERE rolname = current_user`,
    });

    expect(role.rows).toEqual([
      {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        memberships: 0,
      },
    ]);
  });

  it('reruns keep the data and rotate the password', async () => {
    await provisionBoth();
    await queryAs({
      role: STAGING,
      password: STAGING_PASSWORD,
      database: STAGING,
      sql: 'CREATE TABLE IF NOT EXISTS kept (id int)',
    });
    const rotated = 'rotated-staging-password';

    await provisionEnvironmentDatabase({
      adminUrl,
      name: STAGING,
      password: rotated,
    });

    const kept = await queryAs({
      role: STAGING,
      password: rotated,
      database: STAGING,
      sql: "SELECT count(*)::int AS tables FROM pg_tables WHERE tablename = 'kept'",
    });
    expect(kept.rows).toEqual([{ tables: 1 }]);
    expect(
      await errorCode(
        queryAs({
          role: STAGING,
          password: STAGING_PASSWORD,
          database: STAGING,
          sql: 'SELECT 1',
        }),
      ),
    ).toBe(INVALID_PASSWORD);
    await provisionEnvironmentDatabase({
      adminUrl,
      name: STAGING,
      password: STAGING_PASSWORD,
    });
  });

  it.each([
    'postgres',
    'church-staging',
    'church_staging; DROP DATABASE postgres',
  ])('refuses %j before touching the server', async (name) => {
    await expect(
      provisionEnvironmentDatabase({
        adminUrl: 'postgresql://nobody@127.0.0.1:9/postgres',
        name,
        password: 'x',
      }),
    ).rejects.toThrow('is not an environment database name');
  });
});
