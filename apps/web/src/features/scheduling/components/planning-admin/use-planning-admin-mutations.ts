import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getErrorMessage,
  getSelectedCycleIdOrThrow,
} from './planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export interface UsePlanningAdminMutationsProps {
  queryClient: QueryClient;
  selectedCycleId: string | null;
}

export interface DeleteEventTimeBlockInput {
  eventId: string;
  eventTimeBlockId: string;
}

interface CreatePlanningMutationInput<TVariables, TResult> {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  invalidateQueryKeys?: QueryKey[] | ((data: TResult) => QueryKey[]);
  successMessage?: string | ((data: TResult) => string);
  onSuccess?: (data: TResult) => void | Promise<void>;
  onError?: (error: Error) => void;
  queryClient: QueryClient;
}

function usePlanningMutation<TVariables, TResult>({
  mutationFn,
  invalidateQueryKeys,
  successMessage,
  onSuccess,
  onError,
  queryClient,
}: CreatePlanningMutationInput<TVariables, TResult>) {
  return useMutation({
    mutationFn,
    onSuccess: async (data) => {
      if (invalidateQueryKeys) {
        const keys =
          typeof invalidateQueryKeys === 'function'
            ? invalidateQueryKeys(data)
            : invalidateQueryKeys;
        await Promise.all(
          keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
      }
      if (onSuccess) {
        await onSuccess(data);
      }
      if (successMessage) {
        const message =
          typeof successMessage === 'function'
            ? successMessage(data)
            : successMessage;
        toast.success(message);
      }
    },
    onError: (error) => {
      if (onError) {
        onError(error as Error);
      } else {
        toast.error(getErrorMessage({ error }));
      }
    },
  });
}

export interface UsePlanningAdminMutationsResult {
  deleteEventTimeBlockPending: boolean;
  handleDeleteEventTimeBlock: (input: DeleteEventTimeBlockInput) => void;
}

export function usePlanningAdminMutations({
  queryClient,
  selectedCycleId,
}: UsePlanningAdminMutationsProps): UsePlanningAdminMutationsResult {
  const deleteEventTimeBlock = usePlanningMutation({
    mutationFn: ({ eventId, eventTimeBlockId }: DeleteEventTimeBlockInput) =>
      adminApi.deletePlanningEventTimeBlock(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        eventTimeBlockId,
      ),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: 'Time block deleted',
    queryClient,
  });

  function handleDeleteEventTimeBlock(input: DeleteEventTimeBlockInput) {
    deleteEventTimeBlock.mutate(input);
  }

  return {
    deleteEventTimeBlockPending: deleteEventTimeBlock.isPending,
    handleDeleteEventTimeBlock,
  };
}
