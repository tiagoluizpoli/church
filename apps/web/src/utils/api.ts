import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { isOutageError } from '@/shared/utils/outage';
import { toastRequestError } from '@/shared/utils/toast-request-error';

const SERVER_ERROR_RETRIES = 3;

/**
 * The one retry and error policy, shared by the app and the route-tree test
 * helper. Outages are reported once by the reconnecting banner, not per query.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isOutageError(error)) return;
        toastRequestError({
          error,
          action: { label: m.common_retry(), onClick: query.invalidate },
        });
      },
    }),
    defaultOptions: {
      queries: {
        // Outages retry forever (React Query's default backoff caps at 30s)
        // and again on window focus or reconnect (React Query defaults);
        // other 5xx retry three times; 4xx and non-HTTP errors never.
        retry: (failureCount, error) => {
          if (isOutageError(error)) return true;
          const status =
            isAxiosError(error) && error.response ? error.response.status : 0;
          return status >= 500 && failureCount < SERVER_ERROR_RETRIES;
        },
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
