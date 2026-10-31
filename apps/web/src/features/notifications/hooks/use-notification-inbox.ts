import { appConfig } from '@church/app-config';
import { now } from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOnlineState } from '../../volunteers/hooks/use-online-state';
import type {
  NotificationItemViewModel,
  NotificationPageViewModel,
} from '../components/notifications-inbox-section';
import {
  type CachedNotificationInbox,
  notificationQueryKey,
  readCachedNotificationInbox,
  removeLegacyNotificationCache,
  writeCachedNotificationInbox,
} from '../lib/notification-cache';
import { renderNotification } from '../lib/notification-render';
import type {
  GetNotifications200,
  GetNotifications200ItemsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatDayOf, formatInstantOf } from '@/shared/utils/church-time';
import { notificationsApi } from '@/utils/api-instances';

const { pollIntervalMs } = appConfig.notifications;
const STALE_TIME_MS = 30 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;

export interface NotificationInboxItem extends NotificationItemViewModel {
  createdAt: string;
  /** The stored kind and frozen data; words and links are derived from it. */
  source: GetNotifications200ItemsItem;
}

interface MapNotificationItemInput {
  item: GetNotifications200ItemsItem;
  timeZone: string;
}

function mapNotificationItem({
  item,
  timeZone,
}: MapNotificationItemInput): NotificationInboxItem {
  const { title, body, kindLabel } = renderNotification(item);
  return {
    id: item.id,
    title,
    body,
    type: kindLabel,
    createdAt: item.createdAt,
    createdAtLabel: formatInstantOf({ value: item.createdAt, timeZone }),
    isUnread: item.readAt == null,
    source: item,
  };
}

interface BuildViewPagesInput {
  items: NotificationInboxItem[];
  timeZone: string;
}

/** Buckets notifications by the Church-Timezone day they were created on. */
function buildViewPages({
  items,
  timeZone,
}: BuildViewPagesInput): NotificationPageViewModel[] {
  const grouped = new Map<string, NotificationInboxItem[]>();
  for (const item of items) {
    const key = formatDayOf({ value: item.createdAt, timeZone });
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return Array.from(grouped, ([dateBucketLabel, items]) => ({
    dateBucketLabel,
    items,
  }));
}

/** Pages loaded after the first, valid only for the scope and first page they followed. */
interface ExtraPages {
  scopeKey: string;
  /** The first page's cursor when these were loaded; a poll that moves it drops them. */
  afterCursor: string | undefined;
  pages: GetNotifications200ItemsItem[][];
  nextCursor: string | undefined;
}

interface SelectedNotification {
  scopeKey: string;
  id: string;
}

interface MarkReadInput {
  items: GetNotifications200ItemsItem[];
  ids: ReadonlySet<string> | 'all';
  readAt: string;
}

function markItemsRead({ items, ids, readAt }: MarkReadInput) {
  return items.map((item) =>
    item.readAt == null && (ids === 'all' || ids.has(item.id))
      ? { ...item, readAt }
      : item,
  );
}

/**
 * A Church Member's own inbox in the Active Church. Every cache — query key,
 * stored copy, loaded pages and the selected detail — is scoped to the
 * signed-in User and Active Church, so switching either shows none of the
 * other's rows. Only kind and data are cached; words are rendered on every
 * pass, so a locale change rewrites the whole history.
 */
export function useNotificationInbox() {
  const { churchTimezone } = useTimezone();
  const isOnline = useOnlineState();
  const queryClient = useQueryClient();
  const callerScope = useCallerCapabilitiesScope();
  const scope = callerScope?.userId
    ? { userId: callerScope.userId, churchId: callerScope.churchId }
    : undefined;
  const scopeKey = scope ? `${scope.userId}:${scope.churchId}` : '';
  const queryKey = scope
    ? notificationQueryKey(scope)
    : (['notifications'] as const);
  const cached = scope ? readCachedNotificationInbox(scope) : undefined;

  const firstPageQuery = useQuery({
    queryKey,
    queryFn: () => notificationsApi.getNotifications(),
    enabled: scope !== undefined,
    gcTime: GC_TIME_MS,
    placeholderData: cached?.pages[0]
      ? {
          items: cached.pages[0],
          nextCursor: cached.pages[1] ? undefined : cached.nextCursor,
          unreadCount: cached.unreadCount,
        }
      : undefined,
    refetchInterval: isOnline ? pollIntervalMs : false,
    refetchOnMount: isOnline ? 'always' : false,
    refetchOnReconnect: true,
    staleTime: STALE_TIME_MS,
  });
  const firstPage = firstPageQuery.data;

  const [extra, setExtra] = useState<ExtraPages | undefined>();
  const [selected, setSelected] = useState<SelectedNotification | undefined>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const activeExtra =
    extra?.scopeKey === scopeKey && extra.afterCursor === firstPage?.nextCursor
      ? extra
      : undefined;

  useEffect(() => {
    removeLegacyNotificationCache();
  }, []);

  // A scope change starts from nothing: no rows, paging or detail carry over.
  const previousScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (previousScopeKey.current === scopeKey) return;
    previousScopeKey.current = scopeKey;
    setExtra(undefined);
    setSelected(undefined);
    setIsLoadingMore(false);
  }, [scopeKey]);

  const firstItems = firstPage?.items ?? [];
  const sourceItems = [...firstItems, ...(activeExtra?.pages.flat() ?? [])];
  const nextCursor = activeExtra
    ? activeExtra.nextCursor
    : firstPage?.nextCursor;
  const unreadCount = firstPage?.unreadCount ?? 0;

  useEffect(() => {
    if (!scope || !firstPage || firstPageQuery.isPlaceholderData) return;
    const inbox: CachedNotificationInbox = {
      pages: [firstPage.items, ...(activeExtra?.pages ?? [])],
      nextCursor: activeExtra ? activeExtra.nextCursor : firstPage.nextCursor,
      unreadCount: firstPage.unreadCount,
    };
    writeCachedNotificationInbox({ scope, inbox });
  }, [scope, firstPage, firstPageQuery.isPlaceholderData, activeExtra]);

  interface ApplyReadInput {
    ids: ReadonlySet<string> | 'all';
    /** Unread rows this action turned read; the server count is whole-inbox. */
    unreadDelta: number;
  }

  const applyRead = ({ ids, unreadDelta }: ApplyReadInput) => {
    const readAt = now();
    queryClient.setQueryData<GetNotifications200>(queryKey, (current) =>
      current
        ? {
            ...current,
            items: markItemsRead({ items: current.items, ids, readAt }),
            unreadCount:
              ids === 'all'
                ? 0
                : Math.max(0, current.unreadCount - unreadDelta),
          }
        : current,
    );
    setExtra((current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) =>
              markItemsRead({ items: page, ids, readAt }),
            ),
          }
        : current,
    );
  };

  interface MarkReadVariables {
    notificationId: string;
    wasUnread: boolean;
    scopeKey: string;
  }

  const markRead = useMutation({
    mutationFn: ({ notificationId }: MarkReadVariables) =>
      notificationsApi.markNotificationRead(notificationId),
    onSuccess: async (
      _result,
      { notificationId, wasUnread, scopeKey: markedIn },
    ) => {
      // The inbox changed owner while this was in flight: nothing here to update.
      if (markedIn !== previousScopeKey.current) return;
      applyRead({
        ids: new Set([notificationId]),
        unreadDelta: wasUnread ? 1 : 0,
      });
      await queryClient.invalidateQueries({
        queryKey: ['volunteer-dashboard'],
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAllRead = useMutation({
    mutationFn: (_markedIn: string) =>
      notificationsApi.markAllNotificationsRead(),
    onSuccess: async (_result, markedIn) => {
      if (markedIn !== previousScopeKey.current) return;
      applyRead({ ids: 'all', unreadDelta: 0 });
      await queryClient.invalidateQueries({
        queryKey: ['volunteer-dashboard'],
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore || !scope) return;
    const requestScopeKey = scopeKey;
    setIsLoadingMore(true);
    try {
      const page = await notificationsApi.getNotifications({
        cursor: nextCursor,
      });
      setExtra((current) => {
        // The inbox changed owner while this page was in flight.
        if (previousScopeKey.current !== requestScopeKey) return current;
        const loaded = activeExtra ? current : undefined;
        return {
          scopeKey: requestScopeKey,
          afterCursor: firstPage?.nextCursor,
          pages: [...(loaded?.pages ?? []), page.items],
          nextCursor: page.nextCursor,
        };
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const items = sourceItems.map((item) =>
    mapNotificationItem({ item, timeZone: churchTimezone }),
  );
  const selectedNotification =
    selected?.scopeKey === scopeKey
      ? items.find((item) => item.id === selected.id)
      : undefined;

  const setSelectedNotificationId = (id: string | undefined) =>
    setSelected(id === undefined ? undefined : { scopeKey, id });

  return {
    hasMore: nextCursor != null,
    isError: firstPageQuery.isError && items.length === 0,
    isLoading: firstPageQuery.isLoading,
    isLoadingMore,
    items,
    loadMore,
    markAllRead: () => markAllRead.mutate(scopeKey),
    markRead: (notificationId: string) =>
      markRead.mutate({
        notificationId,
        wasUnread:
          items.find((item) => item.id === notificationId)?.isUnread ?? false,
        scopeKey,
      }),
    /** Opens the detail sheet and marks the item read; it never navigates. */
    openNotification: (notificationId: string) => {
      const notification = items.find((item) => item.id === notificationId);
      if (notification?.isUnread) {
        markRead.mutate({ notificationId, wasUnread: true, scopeKey });
      }
      setSelectedNotificationId(notificationId);
    },
    pages: buildViewPages({ items, timeZone: churchTimezone }),
    refresh: () => firstPageQuery.refetch(),
    selectedNotification,
    setSelectedNotificationId,
    unreadCount,
  };
}
