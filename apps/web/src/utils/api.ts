import { m } from '@church/i18n/messages';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const msg =
        error instanceof Error ? error.message : m.common_generic_error();
      toast.error(msg, {
        action: { label: 'retry', onClick: query.invalidate },
      });
    },
  }),
});
