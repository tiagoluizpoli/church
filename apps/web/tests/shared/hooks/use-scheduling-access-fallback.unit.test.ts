import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { resolveSchedulingAccessFallback } from '@/shared/hooks/use-scheduling-access-fallback';

describe('resolveSchedulingAccessFallback', () => {
  it('returns "/" in every branch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = await resolveSchedulingAccessFallback({ queryClient });
    expect(result).toBe('/');
    queryClient.clear();
  });
});
