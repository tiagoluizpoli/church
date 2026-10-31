import { useQueryClient } from '@tanstack/react-query';
import { type NavigateOptions, useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
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
        onSuccess: () => {
          queryClient.clear();
          clearNotificationCache();
          navigate({ to, search });
        },
      },
    });
  };
}
