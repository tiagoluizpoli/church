import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOnlineState } from './use-online-state';

export interface DashboardRefreshVisibleData {
  assignmentGroups: unknown;
  availabilityTasks: unknown;
  ministrySchedule: unknown;
  notificationPages: unknown;
}

export interface UseDashboardRefreshOptions {
  visibleData: DashboardRefreshVisibleData;
  onRefresh: () => Promise<void>;
}

export type DashboardRefreshState = 'idle' | 'refreshing' | 'error';

function serializeVisibleData(
  visibleData: DashboardRefreshVisibleData,
): string {
  return JSON.stringify(visibleData);
}

export function useDashboardRefresh({
  visibleData,
  onRefresh,
}: UseDashboardRefreshOptions) {
  const isOnline = useOnlineState();
  const [refreshState, setRefreshState] =
    useState<DashboardRefreshState>('idle');
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
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [hasBackgroundUpdate]);

  const refresh = async () => {
    if (!isOnline) {
      setRefreshState('error');
      toast.error(
        'Refresh failed while offline. Last-known dashboard data is still available.',
      );
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
      toast.error(
        error instanceof Error
          ? error.message
          : 'Refresh failed. Last-known dashboard data is still available.',
      );
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
