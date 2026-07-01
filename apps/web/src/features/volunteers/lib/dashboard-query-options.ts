import type { NotificationInboxItem } from '../hooks/use-notification-inbox';
import type {
  DashboardMinistrySchedule,
  DashboardSnapshot,
} from './dashboard-mappers';

const DASHBOARD_STORAGE_PREFIX = 'volunteer-dashboard';
const DASHBOARD_SNAPSHOT_STORAGE_KEY = `${DASHBOARD_STORAGE_PREFIX}:snapshot`;
const DASHBOARD_NOTIFICATIONS_STORAGE_KEY = `${DASHBOARD_STORAGE_PREFIX}:notifications`;
const MINISTRY_SCHEDULE_STORAGE_KEY_PREFIX = `${DASHBOARD_STORAGE_PREFIX}:ministry-schedule`;

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const STALE_TIME_MS = 30 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;

export interface CachedNotificationInboxState {
  loadedPages: NotificationInboxItem[][];
  nextCursor?: string;
}

function canUseStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  );
}

function readStorageValue<T>(key: string): T | undefined {
  if (!canUseStorage()) {
    return undefined;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}

function writeStorageValue<T>(key: string, value: T): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getDashboardSnapshotQueryConfig(isOnline: boolean) {
  return {
    gcTime: GC_TIME_MS,
    initialData: isOnline ? undefined : readCachedDashboardSnapshot,
    placeholderData: isOnline ? readCachedDashboardSnapshot : undefined,
    refetchInterval: isOnline ? REFRESH_INTERVAL_MS : false,
    refetchOnMount: isOnline ? 'always' : false,
    refetchOnReconnect: true,
    staleTime: STALE_TIME_MS,
  } as const;
}

export function getMinistryScheduleQueryConfig(
  ministryId: string | undefined,
  isOnline: boolean,
) {
  return {
    gcTime: GC_TIME_MS,
    initialData: isOnline
      ? undefined
      : () => readCachedMinistrySchedule(ministryId),
    placeholderData: isOnline
      ? () => readCachedMinistrySchedule(ministryId)
      : undefined,
    refetchInterval: isOnline ? REFRESH_INTERVAL_MS : false,
    refetchOnMount: isOnline ? 'always' : false,
    refetchOnReconnect: true,
    staleTime: STALE_TIME_MS,
  } as const;
}

export function getNotificationsQueryConfig(isOnline: boolean) {
  return {
    gcTime: GC_TIME_MS,
    refetchInterval: isOnline ? REFRESH_INTERVAL_MS : false,
    refetchOnMount: isOnline ? 'always' : false,
    refetchOnReconnect: true,
    staleTime: STALE_TIME_MS,
  } as const;
}

export function readCachedDashboardSnapshot(): DashboardSnapshot | undefined {
  return readStorageValue<DashboardSnapshot>(DASHBOARD_SNAPSHOT_STORAGE_KEY);
}

export function writeCachedDashboardSnapshot(
  snapshot: DashboardSnapshot,
): void {
  writeStorageValue(DASHBOARD_SNAPSHOT_STORAGE_KEY, snapshot);
}

export function readCachedNotificationInbox():
  | CachedNotificationInboxState
  | undefined {
  return readStorageValue<CachedNotificationInboxState>(
    DASHBOARD_NOTIFICATIONS_STORAGE_KEY,
  );
}

export function writeCachedNotificationInbox(
  state: CachedNotificationInboxState,
): void {
  writeStorageValue(DASHBOARD_NOTIFICATIONS_STORAGE_KEY, state);
}

export function readCachedMinistrySchedule(
  ministryId: string | undefined,
): DashboardMinistrySchedule | undefined {
  if (!ministryId) {
    return undefined;
  }

  return readStorageValue<DashboardMinistrySchedule>(
    `${MINISTRY_SCHEDULE_STORAGE_KEY_PREFIX}:${ministryId}`,
  );
}

export function writeCachedMinistrySchedule(
  ministryId: string,
  schedule: DashboardMinistrySchedule,
): void {
  writeStorageValue(
    `${MINISTRY_SCHEDULE_STORAGE_KEY_PREFIX}:${ministryId}`,
    schedule,
  );
}
