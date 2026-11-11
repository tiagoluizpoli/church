import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(requestErrorMessage(error), {
        action: { label: m.common_retry(), onClick: query.invalidate },
      });
    },
  }),
});
