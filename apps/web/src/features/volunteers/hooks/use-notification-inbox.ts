import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  NotificationItemViewModel,
  NotificationPageViewModel,
} from '../components/notifications-inbox-section';
import {
  getNotificationsQueryConfig,
  readCachedNotificationInbox,
  writeCachedNotificationInbox,
} from '../lib/dashboard-query-options';
import { useOnlineState } from './use-online-state';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import { queryClient } from '@/utils/api';
import { volunteerApi } from '@/utils/api-instances';

interface NotificationDeepLink {
  section: 'availability' | 'assignments' | 'ministry_schedule' | 'none';
  eventId?: string;
  ministryId?: string;
  assignmentId?: string;
}

export interface NotificationInboxItem extends NotificationItemViewModel {
  createdAt: string;
  deepLink: NotificationDeepLink;
}

function formatDateBucket(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function typeToSection(type: string): NotificationDeepLink['section'] {
  if (type === 'availability_reminder') return 'availability';
  if (
    [
      'assignment_added',
      'assignment_changed',
      'assignment_removed',
      'assignment_reminder',
    ].includes(type)
  )
    return 'assignments';
  if (type === 'schedule_published') return 'ministry_schedule';
  return 'none';
}

function mapNotificationItem(
  item: GetNotifications200ItemsItem,
): NotificationInboxItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    type: item.type.replaceAll('_', ' '),
    createdAt: item.createdAt,
    createdAtLabel: new Date(item.createdAt).toLocaleString(),
    isUnread: item.readAt == null,
    deepLink: {
      section: typeToSection(item.type),
      eventId: item.eventId,
      ministryId: item.ministryId,
      assignmentId: item.assignmentId,
    },
  };
}

function mapNotificationPage(page: {
  items: GetNotifications200ItemsItem[];
}): NotificationInboxItem[] {
  return page.items.map(mapNotificationItem);
}

function buildViewPages(
  items: NotificationInboxItem[],
): NotificationPageViewModel[] {
  const grouped = new Map<string, NotificationInboxItem[]>();

  for (const item of items) {
    const key = formatDateBucket(item.createdAt);
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries()).map(
    ([dateBucketLabel, groupedItems]) => ({
      dateBucketLabel,
      items: groupedItems,
    }),
  );
}

async function invalidateNotificationQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['volunteer-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ]);
}

async function refetchNotificationQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    queryClient.refetchQueries({ queryKey: ['notifications'] }),
  ]);
}

export function useNotificationInbox(initialUnreadCount: number) {
  const isOnline = useOnlineState();
  const cachedInboxState = readCachedNotificationInbox();
  const firstPageQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => volunteerApi.getNotifications(),
    ...getNotificationsQueryConfig(isOnline),
  });
  const [loadedPages, setLoadedPages] = useState<NotificationInboxItem[][]>(
    cachedInboxState?.loadedPages ?? [],
  );
  const [nextCursor, setNextCursor] = useState<string | undefined>(
    cachedInboxState?.nextCursor,
  );
  const isLoadingMore = false;
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (!firstPageQuery.data) {
      return;
    }

    const firstPageItems = mapNotificationPage(firstPageQuery.data);
    setLoadedPages((currentPages) =>
      currentPages.length === 0
        ? [firstPageItems]
        : [firstPageItems, ...currentPages.slice(1)],
    );
    setNextCursor(undefined);
  }, [firstPageQuery.data]);

  useEffect(() => {
    if (loadedPages.length === 0) {
      return;
    }

    writeCachedNotificationInbox({
      loadedPages,
      nextCursor,
    });
  }, [loadedPages, nextCursor]);

  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      volunteerApi.markNotificationRead(notificationId),
    onSuccess: async (_result, variables) => {
      setLoadedPages((currentPages) =>
        currentPages.map((page) =>
          page.map((item) =>
            item.id === variables ? { ...item, isUnread: false } : item,
          ),
        ),
      );
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => volunteerApi.markAllNotificationsRead(),
    onSuccess: async () => {
      setLoadedPages((currentPages) =>
        currentPages.map((page) =>
          page.map((item) => ({ ...item, isUnread: false })),
        ),
      );
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const loadMore = async () => {
    return;
  };

  const items = loadedPages.flat();
  const unreadCount =
    items.length > 0
      ? items.filter((item) => item.isUnread).length
      : initialUnreadCount;
  const selectedNotification = items.find(
    (item) => item.id === selectedNotificationId,
  );

  return {
    hasMore: nextCursor != null,
    isLoading: firstPageQuery.isLoading,
    isLoadingMore,
    items,
    markAllRead: () => markAllRead.mutate(),
    markRead: (notificationId: string) => markRead.mutate(notificationId),
    openNotification: (notificationId: string) => {
      const notification = items.find((item) => item.id === notificationId);
      if (notification?.isUnread) {
        markRead.mutate(notificationId);
      }
      setSelectedNotificationId(notificationId);
    },
    pages: buildViewPages(items),
    refresh: refetchNotificationQueries,
    loadMore,
    selectedNotification,
    setSelectedNotificationId,
    unreadCount,
  };
}
