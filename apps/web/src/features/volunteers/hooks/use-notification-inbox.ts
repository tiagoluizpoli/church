import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { NotificationDeepLink } from 'server/src/services/volunteer-dashboard/map-notification-link';
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
import { queryClient, trpc } from '@/utils/trpc';

const PAGE_SIZE = 20;

interface NotificationApiItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  deepLink: NotificationDeepLink;
}

interface NotificationApiPage {
  items: NotificationApiItem[];
  nextCursor?: string;
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

function mapNotificationItem(item: NotificationApiItem): NotificationInboxItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    type: item.type.replaceAll('_', ' '),
    createdAt: item.createdAt,
    createdAtLabel: new Date(item.createdAt).toLocaleString(),
    isUnread: item.readAt == null,
    deepLink: item.deepLink,
  };
}

function mapNotificationPage(
  page: NotificationApiPage,
): NotificationInboxItem[] {
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
    queryClient.invalidateQueries({
      queryKey: trpc.volunteer.getVolunteerDashboard.queryOptions().queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: trpc.volunteer.getMyNotifications.queryOptions({
        limit: PAGE_SIZE,
      }).queryKey,
    }),
  ]);
}

async function refetchNotificationQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: trpc.volunteer.getMyNotifications.queryOptions({
        limit: PAGE_SIZE,
      }).queryKey,
    }),
    queryClient.refetchQueries({
      queryKey: trpc.volunteer.getMyNotifications.queryOptions({
        limit: PAGE_SIZE,
      }).queryKey,
    }),
  ]);
}

export function useNotificationInbox(initialUnreadCount: number) {
  const isOnline = useOnlineState();
  const cachedInboxState = readCachedNotificationInbox();
  const firstPageQuery = useQuery({
    ...trpc.volunteer.getMyNotifications.queryOptions({
      limit: PAGE_SIZE,
    }),
    ...getNotificationsQueryConfig(isOnline),
  });
  const [loadedPages, setLoadedPages] = useState<NotificationInboxItem[][]>(
    cachedInboxState?.loadedPages ?? [],
  );
  const [nextCursor, setNextCursor] = useState<string | undefined>(
    cachedInboxState?.nextCursor,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (!firstPageQuery.data) {
      return;
    }

    const firstPageItems = mapNotificationPage(
      firstPageQuery.data as NotificationApiPage,
    );
    setLoadedPages((currentPages) =>
      currentPages.length === 0
        ? [firstPageItems]
        : [firstPageItems, ...currentPages.slice(1)],
    );
    setNextCursor((firstPageQuery.data as NotificationApiPage).nextCursor);
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

  const markRead = useMutation(
    trpc.volunteer.markNotificationRead.mutationOptions({
      onSuccess: async (_result, variables) => {
        setLoadedPages((currentPages) =>
          currentPages.map((page) =>
            page.map((item) =>
              item.id === variables.notificationId
                ? { ...item, isUnread: false }
                : item,
            ),
          ),
        );
        await invalidateNotificationQueries();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const markAllRead = useMutation(
    trpc.volunteer.markAllNotificationsRead.mutationOptions({
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
    }),
  );

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const nextPage = (await queryClient.fetchQuery(
        trpc.volunteer.getMyNotifications.queryOptions({
          cursor: nextCursor,
          limit: PAGE_SIZE,
        }),
      )) as NotificationApiPage;

      setLoadedPages((currentPages) => [
        ...currentPages,
        mapNotificationPage(nextPage),
      ]);
      setNextCursor(nextPage.nextCursor);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to load notifications.';
      toast.error(message);
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
    markRead: (notificationId: string) => markRead.mutate({ notificationId }),
    openNotification: (notificationId: string) => {
      const notification = items.find((item) => item.id === notificationId);
      if (notification?.isUnread) {
        markRead.mutate({ notificationId });
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
