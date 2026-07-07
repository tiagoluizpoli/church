import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type {
  CycleFormState,
  PlanningCycleEventGroup,
  PlanningCycleSummary,
  PlanningTemplateSummary,
  SelectedPlanningCycle,
  TemplateFormState,
} from './planning-admin.types';
import {
  calculateTotalSlots,
  canCreateCycle,
  canCreateTemplate,
  createEmptyCycleForm,
  createEmptyTemplateBlock,
  createEmptyTemplateForm,
  createTemplateFormFromTemplate,
  getSelectedCycleIdOrThrow,
  isForbiddenError,
} from './planning-admin.utils';
import {
  type ApplyTemplatesOptions,
  usePlanningAdminMutations,
} from './use-planning-admin-mutations';
import { adminApi } from '@/utils/api-instances';

interface SelectCycleInput {
  cycleId: string;
}

interface CycleNameChangeInput {
  name: string;
}

interface CycleDateChangeInput {
  date: string;
}

interface TemplateNameChangeInput {
  name: string;
}

interface TemplateWeekdayChangeInput {
  weekday: string;
}

interface TemplateBlockChangeInput {
  blockId: string;
  field: 'label' | 'startTime' | 'endTime';
  value: string;
}

interface RemoveTemplateBlockInput {
  blockId: string;
}

interface ToggleTemplateSelectionInput {
  templateId: string;
  checked: boolean;
}

interface DeleteTemplateInput {
  templateId: string;
}

interface StartEditTemplateInput {
  templateId: string;
}

export interface UsePlanningAdminResult {
  isAccessDenied: boolean;
  cycles: PlanningCycleSummary[];
  templates: PlanningTemplateSummary[];
  selectedCycleId: string | null;
  selectedCycle: SelectedPlanningCycle | null;
  editingTemplateId: string | null;
  cycleEvents: PlanningCycleEventGroup[];
  totalSlots: number;
  cycleForm: CycleFormState;
  templateForm: TemplateFormState;
  cycleErrorMessage: string | null;
  cyclesLoading: boolean;
  templatesLoading: boolean;
  cycleDetailsLoading: boolean;
  canCreateCycle: boolean;
  canCreateTemplate: boolean;
  createCyclePending: boolean;
  createTemplatePending: boolean;
  updateTemplatePending: boolean;
  saveTemplatePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  applyTemplatesError: string | null;
  lockCyclePending: boolean;
  templateSaveSuccessCount: number;
  selectedTemplateIds: string[];
  resetApplyTemplates: () => void;
  handleCycleNameChange: (input: CycleNameChangeInput) => void;
  handleCycleStartDateChange: (input: CycleDateChangeInput) => void;
  handleCycleEndDateChange: (input: CycleDateChangeInput) => void;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleStartCreateTemplate: () => void;
  handleStartEditTemplate: (input: StartEditTemplateInput) => void;
  handleResetTemplateEditor: () => void;
  handleTemplateNameChange: (input: TemplateNameChangeInput) => void;
  handleTemplateWeekdayChange: (input: TemplateWeekdayChangeInput) => void;
  handleTemplateBlockChange: (input: TemplateBlockChangeInput) => void;
  handleRemoveTemplateBlock: (input: RemoveTemplateBlockInput) => void;
  handleAddTemplateBlock: () => void;
  handleToggleTemplateSelection: (input: ToggleTemplateSelectionInput) => void;
  handleCreateCycle: () => void;
  handleSaveTemplate: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: (options?: ApplyTemplatesOptions) => void;
  handleLockCycle: () => void;
  handleClearSelectedCycle: () => void;
}

export function usePlanningAdmin(): UsePlanningAdminResult {
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [cycleForm, setCycleForm] =
    useState<CycleFormState>(createEmptyCycleForm);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(
    createEmptyTemplateForm,
  );
  const [cycleErrorMessage, setCycleErrorMessage] = useState<string | null>(
    null,
  );
  const [templateSaveSuccessCount, setTemplateSaveSuccessCount] =
    useState<number>(0);

  const cyclesQuery = useQuery({
    queryKey: ['planning-cycles'],
    queryFn: () => adminApi.listPlanningCycles(),
    retry: false,
  });
  const templatesQuery = useQuery({
    queryKey: ['planning-templates'],
    queryFn: () => adminApi.listEventTemplates(),
    retry: false,
  });
  const cycleDetailsQuery = useQuery({
    queryKey: ['planning-cycle-details', selectedCycleId],
    queryFn: () =>
      adminApi.getPlanningCycle(getSelectedCycleIdOrThrow({ selectedCycleId })),
    enabled: Boolean(selectedCycleId),
    retry: false,
  });

  const cycles = cyclesQuery.data?.cycles ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const selectedCycle = cycleDetailsQuery.data?.cycle ?? null;
  const cycleEvents = cycleDetailsQuery.data?.events ?? [];
  const totalSlots = calculateTotalSlots({ events: cycleEvents });

  useEffect(() => {
    setSelectedTemplateIds((currentSelection) => {
      const filtered = currentSelection.filter((templateId) =>
        templates.some((template) => template.id === templateId),
      );
      // Bail out with the same reference when nothing was actually removed —
      // `.filter()` always allocates a new array, and without this guard a
      // still-unstable `templates` reference (e.g. while its query is
      // pending, `?? []` allocates fresh each render) turns this into an
      // infinite render loop (setState → new templates ref → effect reruns).
      return filtered.length === currentSelection.length
        ? currentSelection
        : filtered;
    });
  }, [templates]);

  const isAccessDenied = useMemo(
    () =>
      isForbiddenError({ error: cyclesQuery.error }) ||
      isForbiddenError({ error: templatesQuery.error }),
    [cyclesQuery.error, templatesQuery.error],
  );
  const mutationHandlers = usePlanningAdminMutations({
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
  });

  return {
    isAccessDenied,
    cycles,
    templates,
    selectedCycleId,
    selectedCycle,
    editingTemplateId,
    cycleEvents,
    totalSlots,
    cycleForm,
    templateForm,
    cycleErrorMessage,
    cyclesLoading: cyclesQuery.isLoading,
    templatesLoading: templatesQuery.isLoading,
    cycleDetailsLoading: cycleDetailsQuery.isLoading,
    canCreateCycle: canCreateCycle({ cycleForm }),
    canCreateTemplate: canCreateTemplate({ templateForm }),
    createCyclePending: mutationHandlers.createCyclePending,
    createTemplatePending: mutationHandlers.createTemplatePending,
    updateTemplatePending: mutationHandlers.updateTemplatePending,
    saveTemplatePending: mutationHandlers.saveTemplatePending,
    deleteTemplatePending: mutationHandlers.deleteTemplatePending,
    applyTemplatesPending: mutationHandlers.applyTemplatesPending,
    applyTemplatesError: mutationHandlers.applyTemplatesError,
    lockCyclePending: mutationHandlers.lockCyclePending,
    templateSaveSuccessCount,
    selectedTemplateIds,
    resetApplyTemplates: mutationHandlers.resetApplyTemplates,
    handleCycleNameChange: ({ name }: CycleNameChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, name })),
    handleCycleStartDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, startDate: date })),
    handleCycleEndDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, endDate: date })),
    handleSelectCycle: ({ cycleId }: SelectCycleInput) =>
      setSelectedCycleId(cycleId),
    handleClearSelectedCycle: () => setSelectedCycleId(null),
    handleStartCreateTemplate: () => {
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
    },
    handleStartEditTemplate: ({ templateId }: StartEditTemplateInput) => {
      const template = templates.find(
        (currentTemplate) => currentTemplate.id === templateId,
      );

      if (!template) {
        return;
      }

      setEditingTemplateId(templateId);
      setTemplateForm(createTemplateFormFromTemplate({ template }));
    },
    handleResetTemplateEditor: () => {
      setEditingTemplateId(null);
      setTemplateForm(createEmptyTemplateForm());
    },
    handleTemplateNameChange: ({ name }: TemplateNameChangeInput) =>
      setTemplateForm((currentForm) => ({ ...currentForm, name })),
    handleTemplateWeekdayChange: ({ weekday }: TemplateWeekdayChangeInput) =>
      setTemplateForm((currentForm) => ({ ...currentForm, weekday })),
    handleTemplateBlockChange: ({
      blockId,
      field,
      value,
    }: TemplateBlockChangeInput) =>
      setTemplateForm((currentForm) => ({
        ...currentForm,
        blocks: currentForm.blocks.map((block) =>
          block.id === blockId ? { ...block, [field]: value } : block,
        ),
      })),
    handleRemoveTemplateBlock: ({ blockId }: RemoveTemplateBlockInput) =>
      setTemplateForm((currentForm) => ({
        ...currentForm,
        blocks: currentForm.blocks.filter((block) => block.id !== blockId),
      })),
    handleAddTemplateBlock: () =>
      setTemplateForm((currentForm) => ({
        ...currentForm,
        blocks: [...currentForm.blocks, createEmptyTemplateBlock()],
      })),
    handleToggleTemplateSelection: ({
      templateId,
      checked,
    }: ToggleTemplateSelectionInput) =>
      setSelectedTemplateIds((currentSelection) =>
        checked
          ? [...new Set([...currentSelection, templateId])]
          : currentSelection.filter(
              (currentTemplateId) => currentTemplateId !== templateId,
            ),
      ),
    handleCreateCycle: mutationHandlers.handleCreateCycle,
    handleSaveTemplate: mutationHandlers.handleSaveTemplate,
    handleDeleteTemplate: mutationHandlers.handleDeleteTemplate,
    handleApplyTemplates: mutationHandlers.handleApplyTemplates,
    handleLockCycle: mutationHandlers.handleLockCycle,
  };
}
