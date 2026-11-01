import { m } from '@church/i18n/messages';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useCallback } from 'react';
import { toast } from 'sonner';
import type { CycleFormState, SelectedCycle } from './planning-admin.types';
import {
  createEmptyCycleForm,
  getErrorMessage,
  getSelectedCycleIdOrThrow,
} from './planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export interface UsePlanningAdminMutationsProps {
  queryClient: QueryClient;
  selectedCycleId: string | null;
  selectedCycle: SelectedCycle | null;
  selectedTemplateIds: string[];
  cycleForm: CycleFormState;
  setCycleErrorMessage: Dispatch<SetStateAction<string | null>>;
  setCycleForm: Dispatch<SetStateAction<CycleFormState>>;
  setSelectedCycleId: Dispatch<SetStateAction<string | null>>;
}

export interface ApplyTemplatesOptions {
  onSuccess?: () => void;
}

interface DeleteTemplateInput {
  templateId: string;
}

export interface UpdateEventInput {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
}

export interface DeleteEventInput {
  eventId: string;
}

export interface CreateEventTimeBlockInput {
  eventId: string;
  startTime: string;
  endTime: string;
  label?: string;
}

export interface UpdateEventTimeBlockInput {
  eventId: string;
  eventTimeBlockId: string;
  startTime?: string;
  endTime?: string;
  label?: string;
}

export interface DeleteEventTimeBlockInput {
  eventId: string;
  eventTimeBlockId: string;
}

type CreateCycleBody = Parameters<typeof adminApi.createCycle>[0];

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
  createCyclePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  applyTemplatesError: string | null;
  sendCyclePending: boolean;
  updateEventPending: boolean;
  deleteEventPending: boolean;
  createEventTimeBlockPending: boolean;
  updateEventTimeBlockPending: boolean;
  deleteEventTimeBlockPending: boolean;
  resetApplyTemplates: () => void;
  handleCreateCycle: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: (options?: ApplyTemplatesOptions) => void;
  handleSendCycle: () => void;
  handleUpdateEvent: (input: UpdateEventInput) => void;
  handleDeleteEvent: (input: DeleteEventInput) => void;
  handleCreateEventTimeBlock: (input: CreateEventTimeBlockInput) => void;
  handleUpdateEventTimeBlock: (input: UpdateEventTimeBlockInput) => void;
  handleDeleteEventTimeBlock: (input: DeleteEventTimeBlockInput) => void;
}

export function usePlanningAdminMutations({
  queryClient,
  selectedCycleId,
  selectedCycle,
  selectedTemplateIds,
  cycleForm,
  setCycleErrorMessage,
  setCycleForm,
  setSelectedCycleId,
}: UsePlanningAdminMutationsProps): UsePlanningAdminMutationsResult {
  const createCycle = usePlanningMutation({
    mutationFn: (body: CreateCycleBody) => adminApi.createCycle(body),
    invalidateQueryKeys: (cycle) => [['cycles'], ['cycle-details', cycle.id]],
    successMessage: 'Cycle created',
    onSuccess: async (cycle) => {
      setCycleErrorMessage(null);
      setCycleForm(createEmptyCycleForm());
      setSelectedCycleId(cycle.id);
    },
    onError: (error) => {
      const message = getErrorMessage({ error });
      setCycleErrorMessage(message);
      toast.error(message);
    },
    queryClient,
  });

  const deleteTemplate = usePlanningMutation({
    mutationFn: (templateId: string) =>
      adminApi.deleteEventTemplate(templateId),
    invalidateQueryKeys: [['planning-templates']],
    successMessage: m.event_templates_deleted_toast(),
    queryClient,
  });

  const applyTemplates = usePlanningMutation({
    mutationFn: (cycleId: string) =>
      adminApi.applyPlanningTemplates(cycleId, {
        templateIds: selectedTemplateIds,
      }),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: (result) =>
      `Generated ${result.generatedEventCount} events and ${result.generatedEventTimeBlockCount} time blocks`,
    queryClient,
  });

  const sendCycle = usePlanningMutation({
    mutationFn: (cycleId: string) => adminApi.sendCycle(cycleId),
    invalidateQueryKeys: [['cycles'], ['cycle-details', selectedCycleId]],
    successMessage: 'Cycle sent',
    queryClient,
  });

  const updateEvent = usePlanningMutation({
    mutationFn: ({ eventId, ...body }: UpdateEventInput) =>
      adminApi.updatePlanningEvent(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        body,
      ),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: 'Event updated',
    queryClient,
  });

  const deleteEvent = usePlanningMutation({
    mutationFn: ({ eventId }: DeleteEventInput) =>
      adminApi.cancelPlanningEvent(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
      ),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: 'Event deleted',
    queryClient,
  });

  const createEventTimeBlock = usePlanningMutation({
    mutationFn: ({ eventId, ...body }: CreateEventTimeBlockInput) =>
      adminApi.createPlanningEventTimeBlock(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        body,
      ),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: 'Time block added',
    queryClient,
  });

  const updateEventTimeBlock = usePlanningMutation({
    mutationFn: ({
      eventId,
      eventTimeBlockId,
      ...body
    }: UpdateEventTimeBlockInput) =>
      adminApi.updatePlanningEventTimeBlock(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        eventTimeBlockId,
        body,
      ),
    invalidateQueryKeys: [['cycle-details', selectedCycleId]],
    successMessage: 'Time block updated',
    queryClient,
  });

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

  function handleCreateCycle() {
    createCycle.mutate({
      name: cycleForm.name.trim(),
      startDate: cycleForm.startDate,
      endDate: cycleForm.endDate,
    });
  }

  function handleDeleteTemplate({ templateId }: DeleteTemplateInput) {
    deleteTemplate.mutate(templateId);
  }

  function handleApplyTemplates(options?: ApplyTemplatesOptions) {
    if (selectedCycleId) {
      applyTemplates.mutate(selectedCycleId, {
        onSuccess: () => {
          options?.onSuccess?.();
        },
      });
    }
  }

  function handleSendCycle() {
    if (selectedCycle) {
      sendCycle.mutate(selectedCycle.id);
    }
  }

  function handleUpdateEvent(input: UpdateEventInput) {
    updateEvent.mutate(input);
  }

  function handleDeleteEvent(input: DeleteEventInput) {
    deleteEvent.mutate(input);
  }

  function handleCreateEventTimeBlock(input: CreateEventTimeBlockInput) {
    createEventTimeBlock.mutate(input);
  }

  function handleUpdateEventTimeBlock(input: UpdateEventTimeBlockInput) {
    updateEventTimeBlock.mutate(input);
  }

  function handleDeleteEventTimeBlock(input: DeleteEventTimeBlockInput) {
    deleteEventTimeBlock.mutate(input);
  }

  const resetApplyTemplates = useCallback(() => {
    applyTemplates.reset();
  }, [applyTemplates]);

  return {
    createCyclePending: createCycle.isPending,
    deleteTemplatePending: deleteTemplate.isPending,
    applyTemplatesPending: applyTemplates.isPending,
    applyTemplatesError: applyTemplates.error
      ? getErrorMessage({ error: applyTemplates.error })
      : null,
    sendCyclePending: sendCycle.isPending,
    updateEventPending: updateEvent.isPending,
    deleteEventPending: deleteEvent.isPending,
    createEventTimeBlockPending: createEventTimeBlock.isPending,
    updateEventTimeBlockPending: updateEventTimeBlock.isPending,
    deleteEventTimeBlockPending: deleteEventTimeBlock.isPending,
    resetApplyTemplates,
    handleCreateCycle,
    handleDeleteTemplate,
    handleApplyTemplates,
    handleSendCycle,
    handleUpdateEvent,
    handleDeleteEvent,
    handleCreateEventTimeBlock,
    handleUpdateEventTimeBlock,
    handleDeleteEventTimeBlock,
  };
}
