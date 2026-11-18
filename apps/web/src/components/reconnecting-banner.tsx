import { m } from '@church/i18n/messages';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { isOutageError } from '@/shared/utils/outage';
import { watchReadiness } from '@/shared/utils/readiness';

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
    // A first load in backoff ignores refetch, so cancel before restarting.
    return watchReadiness(async () => {
      await queryClient.cancelQueries();
      await queryClient.invalidateQueries();
    });
  }, [isOutage, queryClient]);

  // The live region stays mounted (empty) so the text is announced when it
  // appears; a region that mounts already filled is often skipped.
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2"
    >
      {isOutage ? (
        <p className="flex max-w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-md">
          <Loader2
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          <span>{m.common_reconnecting()}</span>
        </p>
      ) : null}
    </div>
  );
}
