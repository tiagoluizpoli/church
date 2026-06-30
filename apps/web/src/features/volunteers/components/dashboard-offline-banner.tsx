import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@church/ui/components/alert';
import { Button } from '@church/ui/components/button';
import { CloudOff, RefreshCw } from 'lucide-react';
import type { DashboardRefreshState } from '../hooks/use-dashboard-refresh';

export interface DashboardOfflineBannerProps {
  isOffline: boolean;
  isUsingCachedData: boolean;
  lastUpdatedAt?: string;
  onRefresh: () => void;
  refreshState: DashboardRefreshState;
}

function formatLastUpdated(
  lastUpdatedAt: string | undefined,
): string | undefined {
  if (!lastUpdatedAt) {
    return undefined;
  }

  return new Date(lastUpdatedAt).toLocaleString();
}

export function DashboardOfflineBanner({
  isOffline,
  isUsingCachedData,
  lastUpdatedAt,
  onRefresh,
  refreshState,
}: DashboardOfflineBannerProps) {
  if (!isOffline && !isUsingCachedData && refreshState !== 'error') {
    return null;
  }

  const lastUpdatedLabel = formatLastUpdated(lastUpdatedAt);

  return (
    <Alert variant={isOffline ? 'destructive' : 'default'}>
      <CloudOff className="size-4" />
      <AlertTitle>
        {isOffline ? 'Offline mode' : 'Showing last-known dashboard data'}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {isOffline
            ? 'You are offline. Cached assignments, notifications, and ministry schedule data may be outdated.'
            : 'Dashboard data may be outdated until the next successful refresh.'}
        </p>
        {lastUpdatedLabel ? <p>Last updated: {lastUpdatedLabel}</p> : null}
        {refreshState === 'error' ? (
          <p>Refresh failed. Cached dashboard data stayed visible.</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshState === 'refreshing'}
        >
          <RefreshCw className="mr-2 size-4" />
          {refreshState === 'refreshing'
            ? 'Refreshing dashboard...'
            : 'Refresh dashboard'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
