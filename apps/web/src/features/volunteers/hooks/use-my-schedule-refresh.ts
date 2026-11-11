import { m } from '@church/i18n/messages';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOnlineState } from './use-online-state';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

const BACKGROUND_UPDATE_NOTICE_MS = 6000;

export interface MyScheduleRefreshVisibleData {
  assignments: unknown;
  schedules: unknown;
}

export interface UseMyScheduleRefreshOptions {
  visibleData: MyScheduleRefreshVisibleData;
  onRefresh: () => Promise<void>;
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
}: UseMyScheduleRefreshOptions) {
  const isOnline = useOnlineState();
  const [refreshState, setRefreshState] =
    useState<MyScheduleRefreshState>('idle');
  const [hasBackgroundUpdate, setHasBackgroundUpdate] = useState(false);
  const lastVisibleDataRef = useRef<string | undefined>(undefined);
  const isManualRefreshRef = useRef(false);
  const hasLoadedVisibleDataRef = useRef(false);

  useEffect(() => {
    const nextVisibleData = serializeVisibleData(visibleData);

    if (!hasLoadedVisibleDataRef.current) {
      lastVisibleDataRef.current = nextVisibleData;
      hasLoadedVisibleDataRef.current = true;
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
  }, [visibleData]);

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
      toast.error(requestErrorMessage(error));
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
