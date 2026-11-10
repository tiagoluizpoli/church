const STORAGE_PREFIX = 'my-schedule';
const GC_TIME_MS = 30 * 60 * 1000;

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

interface CachedFetchInput<T> {
  key: string;
  fetch: () => Promise<T>;
}

/** Fetch and keep the last good read so a reload while offline can still show it. */
export async function fetchAndCache<T>({
  key,
  fetch,
}: CachedFetchInput<T>): Promise<T> {
  const data = await fetch();
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${key}`,
      JSON.stringify(data),
    );
  } catch {
    // shortcut: a full or blocked storage just skips caching, upgrade if quotas bite
  }
  return data;
}

interface CachedReadOptionsInput {
  key: string;
  isOnline: boolean;
}

/** Offline: the cache is the data. Online: it is only a placeholder until the fetch lands. */
export function cachedReadOptions<T>({
  key,
  isOnline,
}: CachedReadOptionsInput) {
  const readCached = () => read<T>(`${STORAGE_PREFIX}:${key}`);
  return {
    gcTime: GC_TIME_MS,
    initialData: isOnline ? undefined : readCached,
    placeholderData: isOnline ? readCached : undefined,
  };
}
