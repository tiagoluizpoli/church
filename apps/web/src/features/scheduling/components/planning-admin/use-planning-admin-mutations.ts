import type { QueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type {
  CreatePlanningEventMutationInput,
  CycleFormState,
  PlanningEventFormState,
  SelectedPlanningCycle,
  TemplateFormState,
} from './planning-admin.types';
import {
  createEmptyCycleForm,
  createEmptyPlanningEventForm,
  createEmptyTemplateForm,
  getErrorMessage,
  sortTemplateBlocks,
  toUtcIsoString,
} from './planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export interface UsePlanningAdminMutationsProps {
  queryClient: QueryClient;
  selectedCycleId: string | null;
  selectedCycle: SelectedPlanningCycle | null;
  selectedTemplateIds: string[];
  cycleForm: CycleFormState;
  templateForm: TemplateFormState;
  planningEventForm: PlanningEventFormState;
  setCycleErrorMessage: Dispatch<SetStateAction<string | null>>;
  setCycleForm: Dispatch<SetStateAction<CycleFormState>>;
  setSelectedCycleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTemplateIds: Dispatch<SetStateAction<string[]>>;
  setTemplateForm: Dispatch<SetStateAction<TemplateFormState>>;
  setPlanningEventForm: Dispatch<SetStateAction<PlanningEventFormState>>;
}

interface DeleteTemplateInput {
  templateId: string;
}

export interface UsePlanningAdminMutationsResult {
  createCyclePending: boolean;
  createTemplatePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  createPlanningEventPending: boolean;
  lockCyclePending: boolean;
  handleCreateCycle: () => void;
  handleSaveTemplate: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: () => void;
  handleCreatePlanningEvent: () => void;
  handleLockCycle: () => void;
}

export function usePlanningAdminMutations({
  queryClient,
  selectedCycleId,
  selectedCycle,
  selectedTemplateIds,
  cycleForm,
  templateForm,
  planningEventForm,
  setCycleErrorMessage,
  setCycleForm,
  setSelectedCycleId,
  setSelectedTemplateIds,
  setTemplateForm,
  setPlanningEventForm,
}: UsePlanningAdminMutationsProps): UsePlanningAdminMutationsResult {
  const createCycle = useMutation({
    mutationFn: (body: Parameters<typeof adminApi.createPlanningCycle>[0]) =>
      adminApi.createPlanningCycle(body),
    onSuccess: async (cycle) => {
      setCycleErrorMessage(null);
      setCycleForm(createEmptyCycleForm());
      setSelectedCycleId(cycle.id);
      await queryClient.invalidateQueries({ queryKey: ['planning-cycles'] });
      await queryClient.invalidateQueries({
        queryKey: ['planning-cycle-details', cycle.id],
      });
      toast.success('Planning cycle created');
    },
    onError: (error) => {
      const message = getErrorMessage({ error });
      setCycleErrorMessage(message);
      toast.error(message);
    },
  });

  const createTemplate = useMutation({
    mutationFn: (body: Parameters<typeof adminApi.createEventTemplate>[0]) =>
      adminApi.createEventTemplate(body),
    onSuccess: async (template) => {
      setTemplateForm(createEmptyTemplateForm());
      setSelectedTemplateIds((currentSelection) => [
        ...new Set([...currentSelection, template.id]),
      ]);
      await queryClient.invalidateQueries({ queryKey: ['planning-templates'] });
      toast.success('Template saved');
    },
    onError: (error) => {
      toast.error(getErrorMessage({ error }));
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (templateId: string) =>
      adminApi.deleteEventTemplate(templateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planning-templates'] });
      toast.success('Template deleted');
    },
    onError: (error) => {
      toast.error(getErrorMessage({ error }));
    },
  });

  const applyTemplates = useMutation({
    mutationFn: (cycleId: string) =>
      adminApi.applyPlanningTemplates(cycleId, {
        templateIds: selectedTemplateIds,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['planning-cycle-details', selectedCycleId],
      });
      toast.success(
        `Generated ${result.generatedEventCount} events and ${result.generatedSlotCount} slots`,
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage({ error }));
    },
  });

  const createPlanningEvent = useMutation({
    mutationFn: ({ cycleId, body }: CreatePlanningEventMutationInput) =>
      adminApi.createPlanningEvent(cycleId, body),
    onSuccess: async () => {
      setPlanningEventForm(createEmptyPlanningEventForm());
      await queryClient.invalidateQueries({
        queryKey: ['planning-cycle-details', selectedCycleId],
      });
      toast.success('Event added to cycle');
    },
    onError: (error) => {
      toast.error(getErrorMessage({ error }));
    },
  });

  const lockCycle = useMutation({
    mutationFn: (cycleId: string) => adminApi.lockPlanningCycle(cycleId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['planning-cycles'] }),
        queryClient.invalidateQueries({
          queryKey: ['planning-cycle-details', selectedCycleId],
        }),
      ]);
      toast.success('Cycle locked');
    },
    onError: (error) => {
      toast.error(getErrorMessage({ error }));
    },
  });

  function handleCreateCycle() {
    createCycle.mutate({
      name: cycleForm.name.trim(),
      startDate: cycleForm.startDate,
      endDate: cycleForm.endDate,
    });
  }

  function handleSaveTemplate() {
    createTemplate.mutate({
      name: templateForm.name.trim(),
      weekday: Number.parseInt(templateForm.weekday, 10),
      blocks: sortTemplateBlocks({ blocks: templateForm.blocks }),
    });
  }

  function handleDeleteTemplate({ templateId }: DeleteTemplateInput) {
    deleteTemplate.mutate(templateId);
  }

  function handleApplyTemplates() {
    if (selectedCycleId) {
      applyTemplates.mutate(selectedCycleId);
    }
  }

  function handleCreatePlanningEvent() {
    if (!selectedCycleId) {
      return;
    }

    createPlanningEvent.mutate({
      cycleId: selectedCycleId,
      body: {
        title: planningEventForm.title.trim(),
        startDate: toUtcIsoString({
          localDateTime: planningEventForm.startDateTime,
        }),
        endDate: toUtcIsoString({
          localDateTime: planningEventForm.endDateTime,
        }),
        eventType: planningEventForm.eventType,
      },
    });
  }

  function handleLockCycle() {
    if (selectedCycle) {
      lockCycle.mutate(selectedCycle.id);
    }
  }

  return {
    createCyclePending: createCycle.isPending,
    createTemplatePending: createTemplate.isPending,
    deleteTemplatePending: deleteTemplate.isPending,
    applyTemplatesPending: applyTemplates.isPending,
    createPlanningEventPending: createPlanningEvent.isPending,
    lockCyclePending: lockCycle.isPending,
    handleCreateCycle,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleApplyTemplates,
    handleCreatePlanningEvent,
    handleLockCycle,
  };
}
