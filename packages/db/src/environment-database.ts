import pg from 'pg';

/**
 * One deployed environment's database and login role on a PostgreSQL instance
 * that hosts several environments (homelab: development; VPS: staging and
 * production). The role owns only its database and has no server-wide
 * privileges; PUBLIC loses CONNECT on that database, so no other environment's
 * role can open it. Rerunnable: an existing role gets the given password and
 * the same restrictions, and an existing database is kept.
 */

const ENVIRONMENT_NAME = /^church_[a-z0-9_]+$/;
const POSTGRES_IDENTIFIER_LIMIT = 63;

export interface ProvisionEnvironmentDatabaseInput {
  /** A role allowed to create roles and databases on the shared instance. */
  adminUrl: string;
  /** Both the role and the database name, e.g. `church_staging`. */
  name: string;
  password: string;
}

export async function provisionEnvironmentDatabase({
  adminUrl,
  name,
  password,
}: ProvisionEnvironmentDatabaseInput): Promise<void> {
  if (!ENVIRONMENT_NAME.test(name) || name.length > POSTGRES_IDENTIFIER_LIMIT) {
    throw new Error(
      `"${name}" is not an environment database name: use church_<environment> in lowercase letters, digits and underscores, at most ${POSTGRES_IDENTIFIER_LIMIT} characters.`,
    );
  }
  if (password.length === 0) {
    throw new Error(`The ${name} role needs a non-empty password.`);
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const role = admin.escapeIdentifier(name);
    const secret = admin.escapeLiteral(password);
    const restrictions =
      'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT';
    const existingRole = await admin.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [name],
    );
    const roleVerb = existingRole.rowCount === 0 ? 'CREATE' : 'ALTER';
    await admin.query(
      `${roleVerb} ROLE ${role} WITH ${restrictions} PASSWORD ${secret}`,
    );

    const existingDatabase = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (existingDatabase.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${role} OWNER ${role}`);
    } else {
      await admin.query(`ALTER DATABASE ${role} OWNER TO ${role}`);
    }
    await admin.query(`REVOKE ALL ON DATABASE ${role} FROM PUBLIC`);
  } finally {
    await admin.end();
  }
}
