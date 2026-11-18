import type { z } from 'zod';
import { MY_SCHEDULE_STORAGE_PREFIX } from '@/shared/utils/my-schedule-storage';

const GC_TIME_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

/** One signed-in User in one Active Church; a different pair is a different cache. */
export interface MyScheduleCacheScope {
  userId: string;
  churchId: string;
}

interface StorageKeyInput {
  scope: MyScheduleCacheScope;
  key: string;
}

function storageKey({ scope, key }: StorageKeyInput): string {
  const { userId, churchId } = scope;
  return `${MY_SCHEDULE_STORAGE_PREFIX}:${userId}:${churchId}:${key}`;
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

interface ReadInput<T> extends StorageKeyInput {
  schema: z.ZodType<T>;
}

/** Stored text is untrusted: anything that fails the schema is dropped. */
function read<T>({ scope, key, schema }: ReadInput<T>): T | undefined {
  const store = storage();
  const fullKey = storageKey({ scope, key });
  try {
    const raw = store?.getItem(fullKey);
    if (!raw) return undefined;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    store?.removeItem(fullKey);
  } catch {
    // unreadable storage or malformed JSON: treat as no cache
  }
  return undefined;
}

interface CachedFetchInput<T> {
  scope: MyScheduleCacheScope | null;
  key: string;
  fetch: () => Promise<T>;
}

/** Fetch and keep the last good read so a reload while offline can still show it. */
export async function fetchAndCache<T>({
  scope,
  key,
  fetch,
}: CachedFetchInput<T>): Promise<T> {
  const data = await fetch();
  if (!scope) return data;
  try {
    storage()?.setItem(storageKey({ scope, key }), JSON.stringify(data));
  } catch {
    // shortcut: a full or blocked storage just skips caching, upgrade if quotas bite
  }
  return data;
}

interface CachedReadOptionsInput<T> {
  scope: MyScheduleCacheScope | null;
  key: string;
  isOnline: boolean;
  schema: z.ZodType<T>;
}

/**
 * Offline: the cache is the data. Online: it is only a placeholder until the
 * fetch lands, and the read polls so an open page stays current.
 */
export function cachedReadOptions<T>({
  scope,
  key,
  isOnline,
  schema,
}: CachedReadOptionsInput<T>) {
  const readCached = () => (scope ? read({ scope, key, schema }) : undefined);
  return {
    gcTime: GC_TIME_MS,
    initialData: isOnline ? undefined : readCached,
    placeholderData: isOnline ? readCached : undefined,
    refetchInterval: isOnline ? REFRESH_INTERVAL_MS : false,
  } as const;
}
