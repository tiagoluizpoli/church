import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
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
import { TEMPLATE_LIST_QUERY_KEY } from './template-query-keys';
import {
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
  cycleDetailsError: unknown;
  refetchCycleDetails: () => void;
  canCreateCycle: boolean;
  createCyclePending: boolean;
  sendCyclePending: boolean;
  updateEventPending: boolean;
  deleteEventPending: boolean;
  createEventTimeBlockPending: boolean;
  updateEventTimeBlockPending: boolean;
  deleteEventTimeBlockPending: boolean;
  handleCycleNameChange: (input: CycleNameChangeInput) => void;
  handleCycleStartDateChange: (input: CycleDateChangeInput) => void;
  handleCycleEndDateChange: (input: CycleDateChangeInput) => void;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleCreateCycle: () => void;
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
    queryKey: TEMPLATE_LIST_QUERY_KEY,
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
    cycleDetailsError: cycleDetailsQuery.error,
    refetchCycleDetails: () => {
      void cycleDetailsQuery.refetch();
    },
    canCreateCycle: canCreateCycle({ cycleForm }),
    createCyclePending: mutationHandlers.createCyclePending,
    sendCyclePending: mutationHandlers.sendCyclePending,
    updateEventPending: mutationHandlers.updateEventPending,
    deleteEventPending: mutationHandlers.deleteEventPending,
    createEventTimeBlockPending: mutationHandlers.createEventTimeBlockPending,
    updateEventTimeBlockPending: mutationHandlers.updateEventTimeBlockPending,
    deleteEventTimeBlockPending: mutationHandlers.deleteEventTimeBlockPending,
    handleCycleNameChange: ({ name }: CycleNameChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, name })),
    handleCycleStartDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, startDate: date })),
    handleCycleEndDateChange: ({ date }: CycleDateChangeInput) =>
      setCycleForm((currentForm) => ({ ...currentForm, endDate: date })),
    handleSelectCycle,
    handleClearSelectedCycle: () => setSelectedCycleId(null),
    handleCreateCycle: mutationHandlers.handleCreateCycle,
    handleSendCycle: mutationHandlers.handleSendCycle,
    handleUpdateEvent: mutationHandlers.handleUpdateEvent,
    handleDeleteEvent: mutationHandlers.handleDeleteEvent,
    handleCreateEventTimeBlock: mutationHandlers.handleCreateEventTimeBlock,
    handleUpdateEventTimeBlock: mutationHandlers.handleUpdateEventTimeBlock,
    handleDeleteEventTimeBlock: mutationHandlers.handleDeleteEventTimeBlock,
  };
}
