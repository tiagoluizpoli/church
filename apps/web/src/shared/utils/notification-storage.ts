export const STORAGE_PREFIX = 'notifications:v2';
/** Pre-scoping keys, which could show one Church's inbox in another. */
export const LEGACY_STORAGE_KEYS = ['volunteer-dashboard:notifications'];

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Drops every stored inbox and the old unscoped copy, for sign-out. */
export function clearNotificationCache(): void {
  const store = storage();
  if (!store) return;
  const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
  for (const key of keys) {
    if (key?.startsWith(`${STORAGE_PREFIX}:`)) store.removeItem(key);
  }
  for (const key of LEGACY_STORAGE_KEYS) store.removeItem(key);
}
