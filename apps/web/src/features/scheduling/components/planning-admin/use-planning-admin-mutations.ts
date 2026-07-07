import type { QueryClient } from '@tanstack/react-query';
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

export interface UsePlanningAdminMutationsResult {
  createCyclePending: boolean;
  createTemplatePending: boolean;
  updateTemplatePending: boolean;
  saveTemplatePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  applyTemplatesError: string | null;
  lockCyclePending: boolean;
  resetApplyTemplates: () => void;
  handleCreateCycle: () => void;
  handleSaveTemplate: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: (options?: ApplyTemplatesOptions) => void;
  handleLockCycle: () => void;
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
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
      setTemplateSaveSuccessCount((currentCount) => currentCount + 1);
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

  interface UpdateTemplateParams {
    body: Parameters<typeof adminApi.updateEventTemplate>[1];
    templateId: string;
  }

  const updateTemplate = useMutation({
    mutationFn: ({ body, templateId }: UpdateTemplateParams) =>
      adminApi.updateEventTemplate(templateId, body),
    onSuccess: async () => {
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
      setTemplateSaveSuccessCount((currentCount) => currentCount + 1);
      await queryClient.invalidateQueries({ queryKey: ['planning-templates'] });
      toast.success('Template updated');
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
    resetApplyTemplates,
    handleCreateCycle,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleApplyTemplates,
    handleLockCycle,
  };
}
