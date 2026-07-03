import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type {
  CycleFormState,
  PlanningCycleEventGroup,
  PlanningCycleSummary,
  PlanningEventFormState,
  PlanningTemplateSummary,
  SelectedPlanningCycle,
  TemplateFormState,
} from './planning-admin.types';
import {
  calculateTotalSlots,
  canCreateCycle,
  canCreatePlanningEvent,
  canCreateTemplate,
  createEmptyCycleForm,
  createEmptyPlanningEventForm,
  createEmptyTemplateBlock,
  createEmptyTemplateForm,
  getSelectedCycleIdOrThrow,
  isForbiddenError,
} from './planning-admin.utils';
import { usePlanningAdminMutations } from './use-planning-admin-mutations';
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

interface PlanningEventTextChangeInput {
  value: string;
}

interface PlanningEventTypeChangeInput {
  eventType: PlanningEventFormState['eventType'];
}

export interface UsePlanningAdminResult {
  isAccessDenied: boolean;
  cycles: PlanningCycleSummary[];
  templates: PlanningTemplateSummary[];
  selectedCycleId: string | null;
  selectedCycle: SelectedPlanningCycle | null;
  cycleEvents: PlanningCycleEventGroup[];
  totalSlots: number;
  cycleForm: CycleFormState;
  templateForm: TemplateFormState;
  planningEventForm: PlanningEventFormState;
  cycleErrorMessage: string | null;
  cyclesLoading: boolean;
  templatesLoading: boolean;
  cycleDetailsLoading: boolean;
  canCreateCycle: boolean;
  canCreateTemplate: boolean;
  canCreatePlanningEvent: boolean;
  createCyclePending: boolean;
  createTemplatePending: boolean;
  deleteTemplatePending: boolean;
  applyTemplatesPending: boolean;
  createPlanningEventPending: boolean;
  lockCyclePending: boolean;
  selectedTemplateIds: string[];
  handleCycleNameChange: (input: CycleNameChangeInput) => void;
  handleCycleStartDateChange: (input: CycleDateChangeInput) => void;
  handleCycleEndDateChange: (input: CycleDateChangeInput) => void;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleTemplateNameChange: (input: TemplateNameChangeInput) => void;
  handleTemplateWeekdayChange: (input: TemplateWeekdayChangeInput) => void;
  handleTemplateBlockChange: (input: TemplateBlockChangeInput) => void;
  handleRemoveTemplateBlock: (input: RemoveTemplateBlockInput) => void;
  handleAddTemplateBlock: () => void;
  handleToggleTemplateSelection: (input: ToggleTemplateSelectionInput) => void;
  handlePlanningEventTitleChange: (input: PlanningEventTextChangeInput) => void;
  handlePlanningEventStartChange: (input: PlanningEventTextChangeInput) => void;
  handlePlanningEventEndChange: (input: PlanningEventTextChangeInput) => void;
  handlePlanningEventTypeChange: (input: PlanningEventTypeChangeInput) => void;
  handleCreateCycle: () => void;
  handleSaveTemplate: () => void;
  handleDeleteTemplate: (input: DeleteTemplateInput) => void;
  handleApplyTemplates: () => void;
  handleCreatePlanningEvent: () => void;
  handleLockCycle: () => void;
}

export function usePlanningAdmin(): UsePlanningAdminResult {
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [cycleForm, setCycleForm] =
    useState<CycleFormState>(createEmptyCycleForm);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(
    createEmptyTemplateForm,
  );
  const [planningEventForm, setPlanningEventForm] =
    useState<PlanningEventFormState>(createEmptyPlanningEventForm);
  const [cycleErrorMessage, setCycleErrorMessage] = useState<string | null>(
    null,
  );

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
    if (!selectedCycleId && cycles.length > 0) {
      setSelectedCycleId(cycles[0]?.id ?? null);
    }
  }, [cycles, selectedCycleId]);

  useEffect(() => {
    setSelectedTemplateIds((currentSelection) =>
      currentSelection.filter((templateId) =>
        templates.some((template) => template.id === templateId),
      ),
    );
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
    cycleForm,
    templateForm,
    planningEventForm,
    setCycleErrorMessage,
    setCycleForm,
    setSelectedCycleId,
    setSelectedTemplateIds,
    setTemplateForm,
    setPlanningEventForm,
  });

  return {
    isAccessDenied,
    cycles,
    templates,
    selectedCycleId,
    selectedCycle,
    cycleEvents,
    totalSlots,
    cycleForm,
    templateForm,
    planningEventForm,
    cycleErrorMessage,
    cyclesLoading: cyclesQuery.isLoading,
    templatesLoading: templatesQuery.isLoading,
    cycleDetailsLoading: cycleDetailsQuery.isLoading,
    canCreateCycle: canCreateCycle({ cycleForm }),
    canCreateTemplate: canCreateTemplate({ templateForm }),
    canCreatePlanningEvent: canCreatePlanningEvent({
      planningEventForm,
      selectedCycleId,
    }),
    createCyclePending: mutationHandlers.createCyclePending,
    createTemplatePending: mutationHandlers.createTemplatePending,
    deleteTemplatePending: mutationHandlers.deleteTemplatePending,
    applyTemplatesPending: mutationHandlers.applyTemplatesPending,
    createPlanningEventPending: mutationHandlers.createPlanningEventPending,
    lockCyclePending: mutationHandlers.lockCyclePending,
    selectedTemplateIds,
    handleCycleNameChange: ({ name }: CycleNameChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, name })),
    handleCycleStartDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, startDate: date })),
    handleCycleEndDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, endDate: date })),
    handleSelectCycle: ({ cycleId }: SelectCycleInput) =>
      setSelectedCycleId(cycleId),
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
    handlePlanningEventTitleChange: ({ value }: PlanningEventTextChangeInput) =>
      setPlanningEventForm((currentForm) => ({ ...currentForm, title: value })),
    handlePlanningEventStartChange: ({ value }: PlanningEventTextChangeInput) =>
      setPlanningEventForm((currentForm) => ({
        ...currentForm,
        startDateTime: value,
      })),
    handlePlanningEventEndChange: ({ value }: PlanningEventTextChangeInput) =>
      setPlanningEventForm((currentForm) => ({
        ...currentForm,
        endDateTime: value,
      })),
    handlePlanningEventTypeChange: ({
      eventType,
    }: PlanningEventTypeChangeInput) =>
      setPlanningEventForm((currentForm) => ({ ...currentForm, eventType })),
    handleCreateCycle: mutationHandlers.handleCreateCycle,
    handleSaveTemplate: mutationHandlers.handleSaveTemplate,
    handleDeleteTemplate: mutationHandlers.handleDeleteTemplate,
    handleApplyTemplates: mutationHandlers.handleApplyTemplates,
    handleCreatePlanningEvent: mutationHandlers.handleCreatePlanningEvent,
    handleLockCycle: mutationHandlers.handleLockCycle,
  };
}
