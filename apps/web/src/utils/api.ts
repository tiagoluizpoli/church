import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { isOutageError } from '@/shared/utils/outage';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

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
        const message = requestErrorMessage(error);
        const retryLabel = m.common_retry();
        toast.error(message, {
          action: { label: retryLabel, onClick: query.invalidate },
        });
      },
    }),
    defaultOptions: {
      queries: {
        // Outages retry forever (React Query's default backoff caps at 30s);
        // other 5xx retry three times; 4xx and non-HTTP errors never.
        retry: (failureCount, error) => {
          if (isOutageError(error)) return true;
          const status = isAxiosError(error) ? error.response?.status : 0;
          return (status ?? 0) >= 500 && failureCount < SERVER_ERROR_RETRIES;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
