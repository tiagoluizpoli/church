import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { isOutageError } from '@/shared/utils/outage';
import { toastRequestError } from '@/shared/utils/toast-request-error';

const SERVER_ERROR_RETRIES = 3;
const QUERY_ERROR_TOAST_ID = 'query-error';
const QUIET_STATUSES = new Set([404, 409, 410]);

interface CreateQueryClientInput {
  onSessionExpired?: () => void;
}

/** Hard navigation: the session is gone, so every cached answer is stale. */
function redirectToLogin() {
  const { pathname, search, hash } = window.location;
  if (pathname === '/login') return;
  const redirect = encodeURIComponent(`${pathname}${search}${hash}`);
  window.location.assign(`/login?redirect=${redirect}`);
}

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
export function createQueryClient({
  onSessionExpired = redirectToLogin,
}: CreateQueryClientInput = {}): QueryClient {
  let sessionExpired = false;
  // Every query the toast announces, so its one Retry retries them all.
  const failed = new Set<string>();
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onSuccess: (_data, query) => {
        // An answer means the session works again (a 401 on /login redirects nowhere).
        sessionExpired = false;
        failed.delete(query.queryHash);
      },
      onError: (error, query) => {
        if (isOutageError(error)) return;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        // Expected answers the page handles itself, not failures to announce.
        if (status !== undefined && QUIET_STATUSES.has(status)) return;
        if (status === 401) {
          // Every failing query answers 401: redirect once, not per query.
          if (!sessionExpired) {
            sessionExpired = true;
            onSessionExpired();
          }
          return;
        }
        // The page renders its own error and retry, so a toast would repeat it.
        if (query.meta?.showsOwnError) return;
        failed.add(query.queryHash);
        const retryLabel = m.common_retry();
        toastRequestError({
          error,
          id: QUERY_ERROR_TOAST_ID,
          action: {
            label: retryLabel,
            // Query#invalidate only marks it stale; refetch to retry.
            onClick: () => {
              const retried = new Set(failed);
              failed.clear();
              void client.refetchQueries({
                predicate: ({ queryHash }) => retried.has(queryHash),
              });
            },
          },
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
  return client;
}

export const queryClient = createQueryClient();
