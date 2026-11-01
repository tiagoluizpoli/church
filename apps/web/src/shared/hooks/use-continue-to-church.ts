import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import {
  clearActiveChurchScopedCache,
  switchActiveChurch,
} from '@/shared/utils/active-church-switch';
import { activeChurchApi } from '@/utils/api-instances';

export interface ContinueToChurchInput {
  /** An explicit Church to make active; omitted, the entry gate resolves it. */
  churchId?: string;
}

/**
 * Refreshes the session, then lands on Home. With an explicit Church ID the
 * Church is made the Active Church first, so a User who now belongs to
 * several Churches is not asked to choose the Church they just picked.
 * Without one (or when the Church is not among the caller's options) nothing
 * is selected: the entry gate on Home decides, never a Church display name.
 */
export function useContinueToChurch(): (
  input: ContinueToChurchInput,
) => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async ({ churchId }) => {
    await authClient.getSession();
    const church = churchId
      ? (await activeChurchApi.listActiveChurchOptions()).churches.find(
          (option) => option.churchId === churchId,
        )
      : undefined;
    if (!church) {
      await clearActiveChurchScopedCache({ queryClient });
      navigate({ to: '/' });
      return;
    }
    await switchActiveChurch({
      availableAreas: church.availableAreas,
      churchId: church.churchId,
      churchName: church.name,
      destination: '/',
      navigate: ({ destination }) => navigate({ to: destination }),
      queryClient,
      selectActiveChurch: async ({ churchId }) => {
        await activeChurchApi.selectActiveChurch({ churchId });
      },
    });
  };
}
