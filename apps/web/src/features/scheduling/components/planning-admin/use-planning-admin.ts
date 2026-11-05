import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type {
  CycleEventGroup,
  CycleSummary,
  PlanningTemplateSummary,
  SelectedCycle,
} from './planning-admin.types';
import {
  calculateTotalEventTimeBlocks,
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

export interface UsePlanningAdminResult {
  isAccessDenied: boolean;
  cycles: CycleSummary[];
  templates: PlanningTemplateSummary[];
  selectedCycleId: string | null;
  selectedCycle: SelectedCycle | null;
  cycleEvents: CycleEventGroup[];
  totalEventTimeBlocks: number;
  cyclesLoading: boolean;
  /** The list read failed for a reason other than missing access. */
  cyclesError: boolean;
  refetchCycles: () => void;
  templatesLoading: boolean;
  cycleDetailsLoading: boolean;
  cycleDetailsError: unknown;
  refetchCycleDetails: () => void;
  sendCyclePending: boolean;
  updateEventPending: boolean;
  deleteEventPending: boolean;
  createEventTimeBlockPending: boolean;
  updateEventTimeBlockPending: boolean;
  deleteEventTimeBlockPending: boolean;
  handleSelectCycle: (input: SelectCycleInput) => void;
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
  });

  return {
    isAccessDenied,
    cycles,
    templates,
    selectedCycleId,
    selectedCycle,
    cycleEvents,
    totalEventTimeBlocks,
    cyclesLoading: cyclesQuery.isLoading,
    cyclesError: cyclesQuery.isError && !isAccessDenied,
    refetchCycles: () => void cyclesQuery.refetch(),
    templatesLoading: templatesQuery.isLoading,
    cycleDetailsLoading: cycleDetailsQuery.isLoading,
    cycleDetailsError: cycleDetailsQuery.error,
    refetchCycleDetails: () => {
      void cycleDetailsQuery.refetch();
    },
    sendCyclePending: mutationHandlers.sendCyclePending,
    updateEventPending: mutationHandlers.updateEventPending,
    deleteEventPending: mutationHandlers.deleteEventPending,
    createEventTimeBlockPending: mutationHandlers.createEventTimeBlockPending,
    updateEventTimeBlockPending: mutationHandlers.updateEventTimeBlockPending,
    deleteEventTimeBlockPending: mutationHandlers.deleteEventTimeBlockPending,
    handleSelectCycle,
    handleClearSelectedCycle: () => setSelectedCycleId(null),
    handleSendCycle: mutationHandlers.handleSendCycle,
    handleUpdateEvent: mutationHandlers.handleUpdateEvent,
    handleDeleteEvent: mutationHandlers.handleDeleteEvent,
    handleCreateEventTimeBlock: mutationHandlers.handleCreateEventTimeBlock,
    handleUpdateEventTimeBlock: mutationHandlers.handleUpdateEventTimeBlock,
    handleDeleteEventTimeBlock: mutationHandlers.handleDeleteEventTimeBlock,
  };
}
