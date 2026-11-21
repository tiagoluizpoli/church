import { m } from '@church/i18n/messages';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOnlineState } from './use-online-state';
import { toastRequestError } from '@/shared/utils/toast-request-error';

const BACKGROUND_UPDATE_NOTICE_MS = 6000;

export interface MyScheduleRefreshVisibleData {
  assignments: unknown;
  schedules: unknown;
}

export interface UseMyScheduleRefreshOptions {
  visibleData: MyScheduleRefreshVisibleData;
  onRefresh: () => Promise<void>;
  /** A new scope (e.g. other filters) is a fresh baseline, not a background update. */
  scopeKey?: string;
  /** The data on screen is a previous scope's, kept while the new one loads. */
  isStale?: boolean;
}

export type MyScheduleRefreshState = 'idle' | 'refreshing' | 'error';

function serializeVisibleData(
  visibleData: MyScheduleRefreshVisibleData,
): string {
  return JSON.stringify(visibleData);
}

export function useMyScheduleRefresh({
  visibleData,
  onRefresh,
  scopeKey = '',
  isStale = false,
}: UseMyScheduleRefreshOptions) {
  const isOnline = useOnlineState();
  const [refreshState, setRefreshState] =
    useState<MyScheduleRefreshState>('idle');
  const [hasBackgroundUpdate, setHasBackgroundUpdate] = useState(false);
  const lastVisibleDataRef = useRef<string | undefined>(undefined);
  const isManualRefreshRef = useRef(false);
  const hasLoadedVisibleDataRef = useRef(false);
  const scopeKeyRef = useRef(scopeKey);

  useEffect(() => {
    if (isStale) return;
    const nextVisibleData = serializeVisibleData(visibleData);

    if (!hasLoadedVisibleDataRef.current || scopeKeyRef.current !== scopeKey) {
      lastVisibleDataRef.current = nextVisibleData;
      hasLoadedVisibleDataRef.current = true;
      scopeKeyRef.current = scopeKey;
      return;
    }

    if (lastVisibleDataRef.current === nextVisibleData) {
      if (isManualRefreshRef.current) {
        setRefreshState('idle');
        isManualRefreshRef.current = false;
      }
      return;
    }

    if (!isManualRefreshRef.current) {
      setHasBackgroundUpdate(true);
    } else {
      setRefreshState('idle');
      isManualRefreshRef.current = false;
    }

    lastVisibleDataRef.current = nextVisibleData;
  }, [visibleData, scopeKey, isStale]);

  useEffect(() => {
    if (!hasBackgroundUpdate) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHasBackgroundUpdate(false);
    }, BACKGROUND_UPDATE_NOTICE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [hasBackgroundUpdate]);

  const refresh = async () => {
    if (!isOnline) {
      setRefreshState('error');
      toast.error(m.my_schedule_refresh_offline());
      return;
    }

    isManualRefreshRef.current = true;
    setRefreshState('refreshing');
    setHasBackgroundUpdate(false);

    try {
      await onRefresh();
      setRefreshState('idle');
    } catch (error) {
      setRefreshState('error');
      isManualRefreshRef.current = false;
      toastRequestError({ error });
    }
  };

  return {
    dismissBackgroundUpdate: () => setHasBackgroundUpdate(false),
    hasBackgroundUpdate,
    isOnline,
    isUsingCachedData: !isOnline,
    refresh,
    refreshState,
  };
}
