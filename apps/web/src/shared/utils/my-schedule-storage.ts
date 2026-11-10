export const MY_SCHEDULE_STORAGE_PREFIX = 'my-schedule';

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Drops every stored My schedule read, for sign-out. */
export function clearMyScheduleCache(): void {
  const store = storage();
  if (!store) return;
  const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
  for (const key of keys) {
    if (key?.startsWith(`${MY_SCHEDULE_STORAGE_PREFIX}:`)) {
      store.removeItem(key);
    }
  }
}
