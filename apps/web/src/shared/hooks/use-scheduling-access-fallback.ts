import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

interface UseSchedulingAccessFallbackInput {
  shouldRedirect: boolean;
}

export function useSchedulingAccessFallback({
  shouldRedirect,
}: UseSchedulingAccessFallbackInput): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (shouldRedirect) void navigate({ to: '/', replace: true });
  }, [navigate, shouldRedirect]);
}
