import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

interface UseSchedulingAccessFallbackInput {
  shouldRedirect: boolean;
}

interface ResolveSchedulingAccessFallbackInput {
  queryClient: QueryClient;
}

export function useSchedulingAccessFallback({
  shouldRedirect,
}: UseSchedulingAccessFallbackInput): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!shouldRedirect) return;

    let cancelled = false;
    const redirect = async () => {
      const destination = await resolveSchedulingAccessFallback({
        queryClient,
      });
      if (!cancelled) await navigate({ to: destination, replace: true });
    };

    void redirect();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, shouldRedirect]);
}

export async function resolveSchedulingAccessFallback(
  _input: ResolveSchedulingAccessFallbackInput,
): Promise<'/'> {
  return '/';
}
