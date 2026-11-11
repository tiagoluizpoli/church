import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = requestErrorMessage(error);
      const retryLabel = m.common_retry();
      toast.error(message, {
        action: { label: retryLabel, onClick: query.invalidate },
      });
    },
  }),
});
