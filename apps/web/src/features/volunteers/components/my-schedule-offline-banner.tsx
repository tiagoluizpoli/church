import { m } from '@church/i18n/messages';
import { CloudOff, RefreshCw } from 'lucide-react';
import type { MyScheduleRefreshState } from '../hooks/use-my-schedule-refresh';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';

export interface MyScheduleOfflineBannerProps {
  isOffline: boolean;
  isUsingCachedData: boolean;
  lastUpdatedAt?: string;
  onRefresh: () => void;
  refreshState: MyScheduleRefreshState;
}

export function MyScheduleOfflineBanner({
  isOffline,
  isUsingCachedData,
  lastUpdatedAt,
  onRefresh,
  refreshState,
}: MyScheduleOfflineBannerProps) {
  const { churchTimezone } = useTimezone();
  if (!isOffline && !isUsingCachedData && refreshState !== 'error') {
    return null;
  }

  const lastUpdatedLabel = lastUpdatedAt
    ? formatInstantOf({ value: lastUpdatedAt, timeZone: churchTimezone })
    : undefined;

  // Offline is a known, calm state (amber); only a failed refresh is an error.
  const tone =
    isOffline && refreshState !== 'error'
      ? 'border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-200 *:data-[slot=alert-description]:text-amber-800/90 dark:*:data-[slot=alert-description]:text-amber-200/90'
      : undefined;

  return (
    <Alert
      variant={refreshState === 'error' ? 'destructive' : 'default'}
      className={cn('rounded-lg px-3 py-3 text-sm', tone)}
    >
      <CloudOff className="size-4" />
      <AlertTitle>
        {isOffline
          ? m.my_schedule_offline_title()
          : m.my_schedule_cached_title()}
      </AlertTitle>
      <AlertDescription className="space-y-3 text-sm">
        <p>
          {isOffline
            ? m.my_schedule_offline_body()
            : m.my_schedule_cached_body()}
        </p>
        {lastUpdatedLabel ? (
          <p>{m.my_schedule_last_updated({ time: lastUpdatedLabel })}</p>
        ) : null}
        {refreshState === 'error' ? (
          <p>{m.my_schedule_refresh_failed()}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={onRefresh}
          disabled={refreshState === 'refreshing'}
        >
          <RefreshCw className="size-4" />
          {refreshState === 'refreshing'
            ? m.my_schedule_refreshing()
            : m.my_schedule_refresh()}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
