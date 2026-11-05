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
  type DeleteEventTimeBlockInput,
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
  /** Every owned Event, cancelled ones included: what a Cycle delete removes. */
  ownedEventCount: number;
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
  deleteEventTimeBlockPending: boolean;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleSendCycle: () => void;
  handleClearSelectedCycle: () => void;
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
  const allEvents = cycleDetailsQuery.data?.events ?? [];
  const cycleEvents = allEvents.filter(
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
    ownedEventCount: allEvents.length,
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
    deleteEventTimeBlockPending: mutationHandlers.deleteEventTimeBlockPending,
    handleSelectCycle,
    handleClearSelectedCycle: () => setSelectedCycleId(null),
    handleSendCycle: mutationHandlers.handleSendCycle,
    handleDeleteEventTimeBlock: mutationHandlers.handleDeleteEventTimeBlock,
  };
}
