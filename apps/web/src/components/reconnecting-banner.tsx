import { m } from '@church/i18n/messages';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { isOutageError } from '@/shared/utils/outage';
import { apiClient } from '@/utils/api-client';

const READINESS_PATH = '/api/health';
const FIRST_PROBE_DELAY_MS = 1000;
const MAX_PROBE_DELAY_MS = 30_000;

function hasOutage(queryClient: QueryClient): boolean {
  return queryClient
    .getQueryCache()
    .getAll()
    .some(
      (query) =>
        query.state.fetchStatus !== 'idle' &&
        isOutageError(query.state.fetchFailureReason),
    );
}

/**
 * One banner for any query stuck in an outage. While it shows, readiness is
 * probed with capped backoff (and at once on focus or reconnect); when it
 * answers OK every query starts over, which also clears the banner.
 */
export function ReconnectingBanner() {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const isOutage = useSyncExternalStore(subscribe, () =>
    hasOutage(queryClient),
  );

  useEffect(() => {
    if (!isOutage) return;
    let delay = FIRST_PROBE_DELAY_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const probe = async () => {
      clearTimeout(timer);
      try {
        await apiClient({ url: READINESS_PATH });
      } catch {
        if (stopped) return;
        timer = setTimeout(probe, delay);
        delay = Math.min(delay * 2, MAX_PROBE_DELAY_MS);
        return;
      }
      if (stopped) return;
      // A first load in backoff ignores refetch, so cancel before restarting.
      await queryClient.cancelQueries();
      await queryClient.invalidateQueries();
    };

    timer = setTimeout(probe, delay);
    window.addEventListener('focus', probe);
    window.addEventListener('online', probe);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', probe);
      window.removeEventListener('online', probe);
    };
  }, [isOutage, queryClient]);

  if (!isOutage) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2">
      <p
        role="status"
        className="flex max-w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
      >
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
        <span>{m.common_reconnecting()}</span>
      </p>
    </div>
  );
}
