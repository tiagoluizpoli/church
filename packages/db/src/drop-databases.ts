import pg from 'pg';

/**
 * Drops worktree databases (ADR-0005 removal and pruning). Only names of the
 * `church_<identity>_<dev|int|e2e>` shape are ever touched, so the primary's
 * `church` and anything outside the managed namespace stay out of reach.
 * Every name is validated before connecting. Dropping terminates the
 * target's active connections first and tolerates an already-gone database.
 */

const WORKTREE_DATABASE_NAME = /^church_[a-z0-9_]+_(dev|int|e2e)$/;
const ADMIN_DATABASE = 'postgres';
// Worktree removal waits on these; an unreachable server or a stuck drop
// must fail rather than stall it.
const CONNECT_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT = '30s';

export type DropStep = 'validate' | 'connect' | 'list' | 'drop';

export interface DatabaseDropErrorInput {
  step: DropStep;
  database?: string;
  cause: unknown;
}

export class DatabaseDropError extends Error {
  readonly step: DropStep;
  readonly database: string | undefined;

  constructor(input: DatabaseDropErrorInput) {
    const target = input.database
      ? `${input.step} ${input.database}`
      : input.step;
    const reason =
      input.cause instanceof Error ? input.cause.message : String(input.cause);
    super(`Database removal failed at "${target}": ${reason}`, {
      cause: input.cause,
    });
    this.name = 'DatabaseDropError';
    this.step = input.step;
    this.database = input.database;
  }
}

export interface WorktreeDatabaseNameInput {
  database: string;
}

export function isWorktreeDatabaseName(
  input: WorktreeDatabaseNameInput,
): boolean {
  return WORKTREE_DATABASE_NAME.test(input.database);
}

interface StepInput<T> {
  step: DropStep;
  database?: string;
  run: () => T | Promise<T>;
}

async function withStep<T>(input: StepInput<T>): Promise<T> {
  try {
    return await input.run();
  } catch (error) {
    if (error instanceof DatabaseDropError) throw error;
    throw new DatabaseDropError({
      step: input.step,
      database: input.database,
      cause: error,
    });
  }
}

export interface DatabaseServerInput {
  /** Any URL on the PostgreSQL server; its database path is ignored. */
  serverUrl: string;
}

interface AdminSession {
  admin: pg.Client;
}

interface AdminSessionInput<T> extends DatabaseServerInput {
  run: (session: AdminSession) => Promise<T>;
}

interface DatabaseNameRow {
  datname: string;
}

async function withAdminSession<T>(input: AdminSessionInput<T>): Promise<T> {
  const adminUrl = new URL(input.serverUrl);
  adminUrl.pathname = `/${ADMIN_DATABASE}`;
  const admin = new pg.Client({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });

  try {
    await withStep({
      step: 'connect',
      run: async () => {
        await admin.connect();
        await admin.query(`set statement_timeout = '${STATEMENT_TIMEOUT}'`);
      },
    });
    return await input.run({ admin });
  } finally {
    // A close failure must not mask the step that failed.
    await admin.end().catch(() => {});
  }
}

/** Every worktree database on the server, sorted by name. */
export function listWorktreeDatabases(
  input: DatabaseServerInput,
): Promise<string[]> {
  return withAdminSession({
    serverUrl: input.serverUrl,
    run: ({ admin }) =>
      withStep({
        step: 'list',
        run: async () => {
          const result = await admin.query<DatabaseNameRow>(
            'select datname from pg_database order by datname',
          );
          return result.rows
            .map((row) => row.datname)
            .filter((database) => isWorktreeDatabaseName({ database }));
        },
      }),
  });
}

export interface DropDatabasesInput extends DatabaseServerInput {
  databases: string[];
}

export interface DroppedDatabase {
  database: string;
  existed: boolean;
}

export async function dropDatabases(
  input: DropDatabasesInput,
): Promise<DroppedDatabase[]> {
  for (const database of input.databases) {
    if (!isWorktreeDatabaseName({ database })) {
      throw new DatabaseDropError({
        step: 'validate',
        database,
        cause: new Error(
          `"${database}" is not a worktree database; only church_<worktree>_<dev|int|e2e> names may be dropped.`,
        ),
      });
    }
  }

  return withAdminSession({
    serverUrl: input.serverUrl,
    run: async ({ admin }) => {
      const dropped: DroppedDatabase[] = [];

      for (const database of input.databases) {
        const existed = await withStep({
          step: 'drop',
          database,
          run: async () => {
            const existing = await admin.query(
              'select 1 from pg_database where datname = $1',
              [database],
            );
            // Safe to interpolate: validated as [a-z0-9_] above. FORCE
            // terminates the database's active connections before dropping.
            await admin.query(
              `drop database if exists "${database}" with (force)`,
            );
            return existing.rowCount === 1;
          },
        });
        dropped.push({ database, existed });
      }

      return dropped;
    },
  });
}
