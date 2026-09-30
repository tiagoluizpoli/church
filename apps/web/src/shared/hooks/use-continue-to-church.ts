import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ListActiveChurchOptions200ChurchesItem } from '@/infrastructure/api/churchAPI.schemas';
import { authClient } from '@/lib/auth-client';
import { switchActiveChurch } from '@/shared/utils/active-church-switch';
import { activeChurchApi } from '@/utils/api-instances';

export interface ContinueToChurchInput {
  churchId?: string;
  churchName?: string;
}

interface ResolveChurchOptionInput extends ContinueToChurchInput {
  churches: ListActiveChurchOptions200ChurchesItem[];
}

function resolveChurchOption({
  churches,
  churchId,
  churchName,
}: ResolveChurchOptionInput):
  | ListActiveChurchOptions200ChurchesItem
  | undefined {
  if (churchId) return churches.find((church) => church.churchId === churchId);
  if (churchName) return churches.find((church) => church.name === churchName);
  return undefined;
}

/**
 * Refreshes the session, makes the Church a redemption just joined the
 * Active Church, then lands on its dashboard. A User who now belongs to
 * several Churches would otherwise reach `/select-church` and be asked to
 * choose the Church they just picked. Falls back to `/dashboard` (and the
 * entry gate) when the Church is not among the caller's options.
 */
export function useContinueToChurch(): (
  input: ContinueToChurchInput,
) => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async (input) => {
    await authClient.getSession();
    const { churches } = await activeChurchApi.listActiveChurchOptions();
    const church = resolveChurchOption({ churches, ...input });
    if (!church) {
      navigate({ to: '/dashboard' });
      return;
    }
    await switchActiveChurch({
      availableAreas: church.availableAreas,
      churchId: church.churchId,
      churchName: church.name,
      destination: '/dashboard',
      navigate: ({ destination }) => navigate({ to: destination }),
      queryClient,
      selectActiveChurch: async ({ churchId }) => {
        await activeChurchApi.selectActiveChurch({ churchId });
      },
    });
  };
}
