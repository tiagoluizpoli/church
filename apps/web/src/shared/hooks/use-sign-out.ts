import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (to = '/login') => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.removeQueries({ queryKey: ['caller-capabilities'] });
          navigate({ to });
        },
      },
    });
  };
}
