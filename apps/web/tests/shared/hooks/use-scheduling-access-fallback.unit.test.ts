import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { resolveSchedulingAccessFallback } from '@/shared/hooks/use-scheduling-access-fallback';
import { clearActiveChurchScopedCache } from '@/shared/utils/active-church-switch';
import { callerCapabilitiesApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  callerCapabilitiesApi: { getCallerCapabilities: vi.fn() },
}));

const scope = { userId: 'user-a', churchId: 'church-a' };
const queryKey = ['caller-capabilities', scope.userId, scope.churchId];
const grant: GetCallerCapabilities200 = {
  churchId: scope.churchId,
  isChurchAdmin: true,
  ledMinistries: [],
  hasVolunteerMembership: false,
};

describe('Scheduling fallback capability refresh', () => {
  it('cannot restore a grant after Church-scoped requests are cleared during a switch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const pending = Promise.withResolvers<GetCallerCapabilities200>();
    vi.mocked(callerCapabilitiesApi.getCallerCapabilities).mockReturnValueOnce(
      pending.promise,
    );
    const redirect = resolveSchedulingAccessFallback({ queryClient, scope });

    await clearActiveChurchScopedCache({ queryClient });
    pending.resolve(grant);
    await redirect;

    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    queryClient.clear();
  });
});
