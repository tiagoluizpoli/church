import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_PREFIX,
} from '@/shared/utils/notification-storage';

/** Identifies one inbox: a different User or Church is a different cache. */
export interface NotificationScope {
  userId: string;
  churchId: string;
}

export interface CachedNotificationInbox {
  pages: GetNotifications200ItemsItem[][];
  nextCursor?: string;
  unreadCount: number;
}

export function notificationQueryKey({ userId, churchId }: NotificationScope) {
  return ['notifications', userId, churchId] as const;
}

function storageKey({ userId, churchId }: NotificationScope): string {
  return `${STORAGE_PREFIX}:${userId}:${churchId}`;
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Stored data is semantic (kind + data), never translated text. */
export function readCachedNotificationInbox(
  scope: NotificationScope,
): CachedNotificationInbox | undefined {
  const raw = storage()?.getItem(storageKey(scope));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CachedNotificationInbox;
  } catch {
    storage()?.removeItem(storageKey(scope));
    return undefined;
  }
}

export interface WriteCachedNotificationInboxInput {
  scope: NotificationScope;
  inbox: CachedNotificationInbox;
}

export function writeCachedNotificationInbox({
  scope,
  inbox,
}: WriteCachedNotificationInboxInput): void {
  try {
    storage()?.setItem(storageKey(scope), JSON.stringify(inbox));
  } catch {
    // Storage full or blocked: the inbox still works from the network.
  }
}

/** Drops the old unscoped entries; call once when the inbox mounts. */
export function removeLegacyNotificationCache(): void {
  for (const key of LEGACY_STORAGE_KEYS) storage()?.removeItem(key);
}
