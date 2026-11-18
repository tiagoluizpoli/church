import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { toEventSaveRefusal } from './event-editor.utils';
import { adminApi } from '@/utils/api-instances';

export interface UseDeleteEventInput {
  cycleId: string;
  eventId: string;
}

/** Hard-deletes a Draft Event. Success refreshes the Cycle's scoped reads and
 * returns to its review; a failure keeps the page for retry, and a state
 * conflict reloads the authoritative Cycle so the draft actions disappear. */
export function useDeleteEvent({ cycleId, eventId }: UseDeleteEventInput) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () => adminApi.deletePlanningEvent(cycleId, eventId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
      toast.success(m.event_editor_deleted_toast());
      await navigate({ to: '/cycles/$cycleId', params: { cycleId } });
    },
    onError: async (error) => {
      if (toEventSaveRefusal({ error }).stateConflict) {
        await queryClient.invalidateQueries({
          queryKey: ['cycle-details', cycleId],
        });
      }
    },
  });

  return {
    pending: mutation.isPending,
    error: mutation.isError
      ? toEventSaveRefusal({ error: mutation.error }).message
      : null,
    onDelete: () => {
      if (!mutation.isPending) mutation.mutate();
    },
  };
}
