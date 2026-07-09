import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  CycleFormState,
  SelectedPlanningCycle,
  TemplateFormState,
} from './planning-admin.types';
import {
  createEmptyCycleForm,
  createEmptyTemplateForm,
  getErrorMessage,
  getSelectedCycleIdOrThrow,
  sortTemplateBlocks,
} from './planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export interface UsePlanningAdminMutationsProps {
  queryClient: QueryClient;
  selectedCycleId: string | null;
  selectedCycle: SelectedPlanningCycle | null;
  selectedTemplateIds: string[];
  editingTemplateId: string | null;
  cycleForm: CycleFormState;
  templateForm: TemplateFormState;
  setCycleErrorMessage: Dispatch<SetStateAction<string | null>>;
  setCycleForm: Dispatch<SetStateAction<CycleFormState>>;
  setEditingTemplateId: Dispatch<SetStateAction<string | null>>;
  setSelectedCycleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTemplateIds: Dispatch<SetStateAction<string[]>>;
  setTemplateForm: Dispatch<SetStateAction<TemplateFormState>>;
  setTemplateSaveSuccessCount: Dispatch<SetStateAction<number>>;
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
  startDate?: string;
  endDate?: string;
}

export interface DeleteEventInput {
  eventId: string;
}

export interface CreateSlotInput {
  eventId: string;
  startTime: string;
  endTime: string;
  label?: string;
}

export interface UpdateSlotInput {
  eventId: string;
  slotId: string;
  startTime?: string;
  endTime?: string;
  label?: string;
}

export interface DeleteSlotInput {
  eventId: string;
  slotId: string;
}

type CreatePlanningCycleBody = Parameters<
  typeof adminApi.createPlanningCycle
>[0];

type CreateEventTemplateBody = Parameters<
  typeof adminApi.createEventTemplate
>[0];

export interface UpdateTemplateParams {
  body: Parameters<typeof adminApi.updateEventTemplate>[1];
  templateId: string;
}

interface CreatePlanningMutationInput<TVariables, TResult> {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  invalidateQueryKeys?:
    | QueryKey[]
    | ((data: TResult, variables: TVariables) => QueryKey[]);
  successMessage?: string | ((data: TResult, variables: TVariables) => string);
  onSuccess?: (data: TResult, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void;
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
    onSuccess: async (data, variables) => {
      if (invalidateQueryKeys) {
        const keys =
          typeof invalidateQueryKeys === 'function'
            ? invalidateQueryKeys(data, variables)
            : invalidateQueryKeys;
        await Promise.all(
          keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
      }
      if (onSuccess) {
        await onSuccess(data, variables);
      }
      if (successMessage) {
        const message =
          typeof successMessage === 'function'
            ? successMessage(data, variables)
            : successMessage;
        toast.success(message);
      }
    },
    onError: (error, variables) => {
      if (onError) {
        onError(error as Error, variables);
      } else {
        toast.error(getErrorMessage({ error }));
      }
    },
  });
}

export interface UsePlanningAdminMutationsResult {
  createCyclePending: boolean;
  createTemplatePending: boolean;
  updateTemplatePending: boolean;
  saveTemplatePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  applyTemplatesError: string | null;
  lockCyclePending: boolean;
  updateEventPending: boolean;
  deleteEventPending: boolean;
  createSlotPending: boolean;
  updateSlotPending: boolean;
  deleteSlotPending: boolean;
  resetApplyTemplates: () => void;
  handleCreateCycle: () => void;
  handleSaveTemplate: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: (options?: ApplyTemplatesOptions) => void;
  handleLockCycle: () => void;
  handleUpdateEvent: (input: UpdateEventInput) => void;
  handleDeleteEvent: (input: DeleteEventInput) => void;
  handleCreateSlot: (input: CreateSlotInput) => void;
  handleUpdateSlot: (input: UpdateSlotInput) => void;
  handleDeleteSlot: (input: DeleteSlotInput) => void;
}

export function usePlanningAdminMutations({
  queryClient,
  selectedCycleId,
  selectedCycle,
  selectedTemplateIds,
  editingTemplateId,
  cycleForm,
  templateForm,
  setCycleErrorMessage,
  setCycleForm,
  setEditingTemplateId,
  setSelectedCycleId,
  setSelectedTemplateIds,
  setTemplateForm,
  setTemplateSaveSuccessCount,
}: UsePlanningAdminMutationsProps): UsePlanningAdminMutationsResult {
  const createCycle = usePlanningMutation({
    mutationFn: (body: CreatePlanningCycleBody) =>
      adminApi.createPlanningCycle(body),
    invalidateQueryKeys: (cycle) => [
      ['planning-cycles'],
      ['planning-cycle-details', cycle.id],
    ],
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

  const createTemplate = usePlanningMutation({
    mutationFn: (body: CreateEventTemplateBody) =>
      adminApi.createEventTemplate(body),
    invalidateQueryKeys: [['planning-templates']],
    successMessage: 'Template saved',
    onSuccess: async (template) => {
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
      setTemplateSaveSuccessCount((currentCount) => currentCount + 1);
      setSelectedTemplateIds((currentSelection) => [
        ...new Set([...currentSelection, template.id]),
      ]);
    },
    queryClient,
  });

  const updateTemplate = usePlanningMutation({
    mutationFn: ({ body, templateId }: UpdateTemplateParams) =>
      adminApi.updateEventTemplate(templateId, body),
    invalidateQueryKeys: [['planning-templates']],
    successMessage: 'Template updated',
    onSuccess: async () => {
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
      setTemplateSaveSuccessCount((currentCount) => currentCount + 1);
    },
    queryClient,
  });

  const deleteTemplate = usePlanningMutation({
    mutationFn: (templateId: string) =>
      adminApi.deleteEventTemplate(templateId),
    invalidateQueryKeys: [['planning-templates']],
    successMessage: 'Template deleted',
    queryClient,
  });

  const applyTemplates = usePlanningMutation({
    mutationFn: (cycleId: string) =>
      adminApi.applyPlanningTemplates(cycleId, {
        templateIds: selectedTemplateIds,
      }),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: (result) =>
      `Generated ${result.generatedEventCount} events and ${result.generatedSlotCount} slots`,
    queryClient,
  });

  const lockCycle = usePlanningMutation({
    mutationFn: (cycleId: string) => adminApi.lockPlanningCycle(cycleId),
    invalidateQueryKeys: [
      ['planning-cycles'],
      ['planning-cycle-details', selectedCycleId],
    ],
    successMessage: 'Cycle locked',
    queryClient,
  });

  const updateEvent = usePlanningMutation({
    mutationFn: ({ eventId, ...body }: UpdateEventInput) =>
      adminApi.updatePlanningEvent(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        body,
      ),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: 'Event updated',
    queryClient,
  });

  const deleteEvent = usePlanningMutation({
    mutationFn: ({ eventId }: DeleteEventInput) =>
      adminApi.cancelPlanningEvent(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
      ),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: 'Event deleted',
    queryClient,
  });

  const createSlot = usePlanningMutation({
    mutationFn: ({ eventId, ...body }: CreateSlotInput) =>
      adminApi.createPlanningEventSlot(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        body,
      ),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: 'Slot added',
    queryClient,
  });

  const updateSlot = usePlanningMutation({
    mutationFn: ({ eventId, slotId, ...body }: UpdateSlotInput) =>
      adminApi.updatePlanningEventSlot(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        slotId,
        body,
      ),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: 'Slot updated',
    queryClient,
  });

  const deleteSlot = usePlanningMutation({
    mutationFn: ({ eventId, slotId }: DeleteSlotInput) =>
      adminApi.deletePlanningEventSlot(
        getSelectedCycleIdOrThrow({ selectedCycleId }),
        eventId,
        slotId,
      ),
    invalidateQueryKeys: [['planning-cycle-details', selectedCycleId]],
    successMessage: 'Slot deleted',
    queryClient,
  });

  function handleCreateCycle() {
    createCycle.mutate({
      name: cycleForm.name.trim(),
      startDate: cycleForm.startDate,
      endDate: cycleForm.endDate,
    });
  }

  function handleSaveTemplate() {
    const body = {
      name: templateForm.name.trim(),
      weekday: Number.parseInt(templateForm.weekday, 10),
      blocks: sortTemplateBlocks({ blocks: templateForm.blocks }),
    };

    if (editingTemplateId) {
      updateTemplate.mutate({ body, templateId: editingTemplateId });
      return;
    }

    createTemplate.mutate(body);
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

  function handleLockCycle() {
    if (selectedCycle) {
      lockCycle.mutate(selectedCycle.id);
    }
  }

  function handleUpdateEvent(input: UpdateEventInput) {
    updateEvent.mutate(input);
  }

  function handleDeleteEvent(input: DeleteEventInput) {
    deleteEvent.mutate(input);
  }

  function handleCreateSlot(input: CreateSlotInput) {
    createSlot.mutate(input);
  }

  function handleUpdateSlot(input: UpdateSlotInput) {
    updateSlot.mutate(input);
  }

  function handleDeleteSlot(input: DeleteSlotInput) {
    deleteSlot.mutate(input);
  }

  const resetApplyTemplates = useCallback(() => {
    applyTemplates.reset();
  }, [applyTemplates]);

  return {
    createCyclePending: createCycle.isPending,
    createTemplatePending: createTemplate.isPending,
    updateTemplatePending: updateTemplate.isPending,
    saveTemplatePending: createTemplate.isPending || updateTemplate.isPending,
    deleteTemplatePending: deleteTemplate.isPending,
    applyTemplatesPending: applyTemplates.isPending,
    applyTemplatesError: applyTemplates.error
      ? getErrorMessage({ error: applyTemplates.error })
      : null,
    lockCyclePending: lockCycle.isPending,
    updateEventPending: updateEvent.isPending,
    deleteEventPending: deleteEvent.isPending,
    createSlotPending: createSlot.isPending,
    updateSlotPending: updateSlot.isPending,
    deleteSlotPending: deleteSlot.isPending,
    resetApplyTemplates,
    handleCreateCycle,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleApplyTemplates,
    handleLockCycle,
    handleUpdateEvent,
    handleDeleteEvent,
    handleCreateSlot,
    handleUpdateSlot,
    handleDeleteSlot,
  };
}
