import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { adminApi } from '@/utils/api-instances';

export interface CallerNavVisibility {
  canSeeScheduling: boolean;
  isResolving: boolean;
}

interface ForbiddenErrorInput {
  error: unknown;
}

function isForbiddenError({ error }: ForbiddenErrorInput): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

/**
 * Resolves which nav surfaces the caller may see. There is no "my roles"
 * endpoint (research.md R1): visibility is derived reactively from whether a
 * lightweight, already role-gated admin query succeeds or is forbidden (403).
 */
export function useCallerRoles(): CallerNavVisibility {
  const ministriesQuery = useQuery({
    queryKey: ['caller-roles', 'listMinistries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });

  if (ministriesQuery.isLoading) {
    return { canSeeScheduling: false, isResolving: true };
  }

  return {
    canSeeScheduling: !isForbiddenError({ error: ministriesQuery.error }),
    isResolving: false,
  };
}
