import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const msg = error instanceof Error ? error.message : 'Request failed';
      toast.error(msg, {
        action: { label: 'retry', onClick: query.invalidate },
      });
    },
  }),
});
