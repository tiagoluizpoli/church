import {
  type DatabasePurpose,
  expectedDatabaseName,
} from '../../packages/db/src/database-target-resolver';

/**
 * The worktree's three database targets (ADR-0005), all on the one root
 * Compose PostgreSQL (docker-compose.yml: fixed published port, default local
 * credentials). Names come from `expectedDatabaseName`, so every target is
 * exactly what the purpose resolver accepts for this worktree.
 */

// Loopback IPv4: Compose may publish only on 127.0.0.1, which `localhost`
// can miss when it resolves to ::1 first.
const LOCAL_DATABASE_SERVER_URL =
  'postgresql://postgres:postgres@127.0.0.1:5444';

export const WORKTREE_DATABASE_PURPOSES: DatabasePurpose[] = [
  'development',
  'integration',
  'e2e',
];

export type WorktreeDatabaseUrls = Record<DatabasePurpose, string>;

export interface WorktreeDatabaseUrlsInput {
  worktree: string;
}

export function worktreeDatabaseUrls(
  input: WorktreeDatabaseUrlsInput,
): WorktreeDatabaseUrls {
  const urls = {} as WorktreeDatabaseUrls;

  for (const purpose of WORKTREE_DATABASE_PURPOSES) {
    const url = new URL(LOCAL_DATABASE_SERVER_URL);
    url.pathname = `/${expectedDatabaseName({ purpose, worktree: input.worktree })}`;
    urls[purpose] = url.toString();
  }

  return urls;
}
