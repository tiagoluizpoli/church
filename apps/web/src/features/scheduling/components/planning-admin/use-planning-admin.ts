import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CycleEventGroup,
  CycleFormState,
  CycleSummary,
  PlanningTemplateSummary,
  SelectedCycle,
} from './planning-admin.types';
import {
  calculateTotalEventTimeBlocks,
  canCreateCycle,
  createEmptyCycleForm,
  getSelectedCycleIdOrThrow,
  isForbiddenError,
} from './planning-admin.utils';
import {
  type ApplyTemplatesOptions,
  type CreateEventTimeBlockInput,
  type DeleteEventInput,
  type DeleteEventTimeBlockInput,
  type UpdateEventInput,
  type UpdateEventTimeBlockInput,
  usePlanningAdminMutations,
} from './use-planning-admin-mutations';
import { adminApi } from '@/utils/api-instances';

export interface SelectCycleInput {
  cycleId: string;
}

interface CycleNameChangeInput {
  name: string;
}

interface CycleDateChangeInput {
  date: string;
}

interface ToggleTemplateSelectionInput {
  templateId: string;
  checked: boolean;
}

export interface UsePlanningAdminResult {
  isAccessDenied: boolean;
  cycles: CycleSummary[];
  templates: PlanningTemplateSummary[];
  selectedCycleId: string | null;
  selectedCycle: SelectedCycle | null;
  cycleEvents: CycleEventGroup[];
  totalEventTimeBlocks: number;
  cycleForm: CycleFormState;
  cycleErrorMessage: string | null;
  cyclesLoading: boolean;
  templatesLoading: boolean;
  cycleDetailsLoading: boolean;
  canCreateCycle: boolean;
  createCyclePending: boolean;
  applyTemplatesPending: boolean;
  applyTemplatesError: string | null;
  sendCyclePending: boolean;
  updateEventPending: boolean;
  deleteEventPending: boolean;
  createEventTimeBlockPending: boolean;
  updateEventTimeBlockPending: boolean;
  deleteEventTimeBlockPending: boolean;
  selectedTemplateIds: string[];
  resetApplyTemplates: () => void;
  handleCycleNameChange: (input: CycleNameChangeInput) => void;
  handleCycleStartDateChange: (input: CycleDateChangeInput) => void;
  handleCycleEndDateChange: (input: CycleDateChangeInput) => void;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleToggleTemplateSelection: (input: ToggleTemplateSelectionInput) => void;
  handleCreateCycle: () => void;
  handleApplyTemplates: (options?: ApplyTemplatesOptions) => void;
  handleSendCycle: () => void;
  handleClearSelectedCycle: () => void;
  handleUpdateEvent: (input: UpdateEventInput) => void;
  handleDeleteEvent: (input: DeleteEventInput) => void;
  handleCreateEventTimeBlock: (input: CreateEventTimeBlockInput) => void;
  handleUpdateEventTimeBlock: (input: UpdateEventTimeBlockInput) => void;
  handleDeleteEventTimeBlock: (input: DeleteEventTimeBlockInput) => void;
}

export function usePlanningAdmin(): UsePlanningAdminResult {
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [cycleForm, setCycleForm] =
    useState<CycleFormState>(createEmptyCycleForm);
  const [cycleErrorMessage, setCycleErrorMessage] = useState<string | null>(
    null,
  );

  const cyclesQuery = useQuery({
    queryKey: ['cycles'],
    queryFn: () => adminApi.listCycles(),
    retry: false,
  });
  const templatesQuery = useQuery({
    queryKey: ['planning-templates'],
    queryFn: () => adminApi.listEventTemplates(),
    retry: false,
  });
  const cycleDetailsQuery = useQuery({
    queryKey: ['cycle-details', selectedCycleId],
    queryFn: () =>
      adminApi.getCycle(getSelectedCycleIdOrThrow({ selectedCycleId })),
    enabled: Boolean(selectedCycleId),
    retry: false,
  });

  const cycles = cyclesQuery.data?.cycles ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const selectedCycle = cycleDetailsQuery.data?.cycle ?? null;
  // A cancelled event (FR-006's day-delete) is a soft delete at the data
  // layer only — the Calendar review table and header counts must still
  // treat it as removed, per FR-006's acceptance scenario and edge case.
  const cycleEvents = (cycleDetailsQuery.data?.events ?? []).filter(
    (eventGroup) => eventGroup.event.status !== 'cancelled',
  );
  const totalEventTimeBlocks = calculateTotalEventTimeBlocks({
    events: cycleEvents,
  });

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
  const handleSelectCycle = useCallback(
    ({ cycleId }: SelectCycleInput) => setSelectedCycleId(cycleId),
    [],
  );

  const mutationHandlers = usePlanningAdminMutations({
    queryClient,
    selectedCycleId,
    selectedCycle,
    selectedTemplateIds,
    cycleForm,
    setCycleErrorMessage,
    setCycleForm,
    setSelectedCycleId,
  });

  return {
    isAccessDenied,
    cycles,
    templates,
    selectedCycleId,
    selectedCycle,
    cycleEvents,
    totalEventTimeBlocks,
    cycleForm,
    cycleErrorMessage,
    cyclesLoading: cyclesQuery.isLoading,
    templatesLoading: templatesQuery.isLoading,
    cycleDetailsLoading: cycleDetailsQuery.isLoading,
    canCreateCycle: canCreateCycle({ cycleForm }),
    createCyclePending: mutationHandlers.createCyclePending,
    applyTemplatesPending: mutationHandlers.applyTemplatesPending,
    applyTemplatesError: mutationHandlers.applyTemplatesError,
    sendCyclePending: mutationHandlers.sendCyclePending,
    updateEventPending: mutationHandlers.updateEventPending,
    deleteEventPending: mutationHandlers.deleteEventPending,
    createEventTimeBlockPending: mutationHandlers.createEventTimeBlockPending,
    updateEventTimeBlockPending: mutationHandlers.updateEventTimeBlockPending,
    deleteEventTimeBlockPending: mutationHandlers.deleteEventTimeBlockPending,
    selectedTemplateIds,
    resetApplyTemplates: mutationHandlers.resetApplyTemplates,
    handleCycleNameChange: ({ name }: CycleNameChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, name })),
    handleCycleStartDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, startDate: date })),
    handleCycleEndDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, endDate: date })),
    handleSelectCycle,
    handleClearSelectedCycle: () => setSelectedCycleId(null),
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
    handleApplyTemplates: mutationHandlers.handleApplyTemplates,
    handleSendCycle: mutationHandlers.handleSendCycle,
    handleUpdateEvent: mutationHandlers.handleUpdateEvent,
    handleDeleteEvent: mutationHandlers.handleDeleteEvent,
    handleCreateEventTimeBlock: mutationHandlers.handleCreateEventTimeBlock,
    handleUpdateEventTimeBlock: mutationHandlers.handleUpdateEventTimeBlock,
    handleDeleteEventTimeBlock: mutationHandlers.handleDeleteEventTimeBlock,
  };
}
