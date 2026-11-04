import type pg from 'pg';

export interface ClearPublicTablesInput {
  /** Connected to a test database; never a development or shared one. */
  pool: pg.Pool;
}

/**
 * Empties every `public` table and restarts their sequences, leaving the
 * `drizzle` migration history alone. Uses DELETE, not TRUNCATE: TRUNCATE gives
 * every table a new file, and the next forced checkpoint (each DROP DATABASE)
 * must fsync all of them, which took over 30s on slow disks (#692).
 * The replica role skips foreign-key triggers so table order does not
 * matter; `set_config(..., true)` scopes it to this statement's transaction.
 */
export async function clearPublicTables({
  pool,
}: ClearPublicTablesInput): Promise<void> {
  await pool.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      PERFORM set_config('session_replication_role', 'replica', true);
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DELETE FROM public.%I', r.tablename);
      END LOOP;
      FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        PERFORM setval(format('public.%I', r.sequencename), 1, false);
      END LOOP;
    END $$;
  `);
}
