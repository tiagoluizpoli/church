/**
 * The worktree's storage target on the root Compose RustFS (docker-compose.yml
 * `storage`, ADR-0005): fixed published port and local-only root credentials.
 * Dependency-free, so env:local loads before dependencies are installed.
 */
export const LOCAL_STORAGE_PORT = 9000;
export const LOCAL_STORAGE_ENDPOINT = `http://127.0.0.1:${LOCAL_STORAGE_PORT}`;
export const LOCAL_STORAGE_CREDENTIAL = 'rustfsadmin';
export const BUCKET_PREFIX = 'church-';

export interface WorktreeBucketNameInput {
  worktree: string;
}

/** `church-<identity>`, underscores as hyphens (bucket names allow neither
 * underscores nor uppercase). */
export function worktreeBucketName(input: WorktreeBucketNameInput): string {
  return `${BUCKET_PREFIX}${input.worktree.replaceAll('_', '-')}`;
}
