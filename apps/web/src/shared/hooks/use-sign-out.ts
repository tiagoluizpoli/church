import { useQueryClient } from '@tanstack/react-query';
import { type NavigateOptions, useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { clearMyScheduleCache } from '@/shared/utils/my-schedule-storage';
import { clearNotificationCache } from '@/shared/utils/notification-storage';

interface SignOutInput {
  to?: NavigateOptions['to'];
  search?: NavigateOptions['search'];
}

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return ({ to = '/login', search }: SignOutInput = {}) => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          // Leave the signed-in pages first: clearing while they are mounted
          // refetches their queries without a session, toasting 401s.
          await navigate({ to, search });
          queryClient.clear();
          clearNotificationCache();
          clearMyScheduleCache();
        },
      },
    });
  };
}
