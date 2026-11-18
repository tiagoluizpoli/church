import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { isOutageError } from '@/shared/utils/outage';
import { toastRequestError } from '@/shared/utils/toast-request-error';

const SERVER_ERROR_RETRIES = 3;

interface RetryInput {
  failureCount: number;
  error: Error;
  serverErrorRetries: number;
}

/** Outages retry forever (React Query's default backoff caps at 30s) and
 * again on window focus or reconnect (React Query defaults); other 5xx retry
 * `serverErrorRetries` times; 4xx and non-HTTP errors never. A query whose
 * page shows its own error passes fewer, so nobody waits on a skeleton. */
export function shouldRetry({
  failureCount,
  error,
  serverErrorRetries,
}: RetryInput): boolean {
  if (isOutageError(error)) return true;
  const status =
    isAxiosError(error) && error.response ? error.response.status : 0;
  return status >= 500 && failureCount < serverErrorRetries;
}

/**
 * The one retry and error policy, shared by the app and the route-tree test
 * helper. Outages are reported once by the reconnecting banner, not per query.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isOutageError(error)) return;
        // The page renders its own error and retry, so a toast would repeat it.
        if (query.meta?.showsOwnError) return;
        const retryLabel = m.common_retry();
        toastRequestError({
          error,
          action: { label: retryLabel, onClick: query.invalidate },
        });
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          shouldRetry({
            failureCount,
            error,
            serverErrorRetries: SERVER_ERROR_RETRIES,
          }),
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
