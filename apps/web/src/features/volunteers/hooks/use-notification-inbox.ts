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

export interface NotificationDeepLink {
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

interface NotificationInboxPagingState {
  pages: NotificationInboxItem[][];
  nextCursor?: string;
}

export function useNotificationInbox(initialUnreadCount: number) {
  const isOnline = useOnlineState();
  const cachedInboxState = readCachedNotificationInbox();
  const firstPageQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => volunteerApi.getNotifications(),
    ...getNotificationsQueryConfig(isOnline),
  });
  const [pagingState, setPagingState] = useState<NotificationInboxPagingState>({
    pages: cachedInboxState?.loadedPages ?? [],
    nextCursor: cachedInboxState?.nextCursor,
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | undefined
  >(undefined);
  const loadedPages = pagingState.pages;
  const nextCursor = pagingState.nextCursor;

  useEffect(() => {
    if (!firstPageQuery.data) {
      return;
    }

    const firstPageData = firstPageQuery.data;
    const firstPageItems = mapNotificationPage(firstPageData);
    setPagingState((current) => {
      const hasAdditionalPages = current.pages.length > 1;
      return {
        pages: hasAdditionalPages
          ? [firstPageItems, ...current.pages.slice(1)]
          : [firstPageItems],
        nextCursor: hasAdditionalPages
          ? current.nextCursor
          : firstPageData.nextCursor,
      };
    });
  }, [firstPageQuery.data]);

  useEffect(() => {
    if (pagingState.pages.length === 0) {
      return;
    }

    writeCachedNotificationInbox({
      loadedPages: pagingState.pages,
      nextCursor: pagingState.nextCursor,
    });
  }, [pagingState]);

  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      volunteerApi.markNotificationRead(notificationId),
    onSuccess: async (_result, variables) => {
      setPagingState((current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.map((item) =>
            item.id === variables ? { ...item, isUnread: false } : item,
          ),
        ),
      }));
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => volunteerApi.markAllNotificationsRead(),
    onSuccess: async () => {
      setPagingState((current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.map((item) => ({ ...item, isUnread: false })),
        ),
      }));
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await volunteerApi.getNotifications({ cursor: nextCursor });
      setPagingState((current) => ({
        pages: [...current.pages, mapNotificationPage(page)],
        nextCursor: page.nextCursor,
      }));
    } finally {
      setIsLoadingMore(false);
    }
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
