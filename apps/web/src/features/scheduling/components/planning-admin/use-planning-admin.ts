import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type {
  CycleEventGroup,
  CyclePlannedCounts,
  CycleSummary,
  PlanningTemplateSummary,
  SelectedCycle,
} from './planning-admin.types';
import {
  getSelectedCycleIdOrThrow,
  isForbiddenError,
} from './planning-admin.utils';
import { TEMPLATE_LIST_QUERY_KEY } from './template-query-keys';
import {
  type DeleteEventTimeBlockInput,
  usePlanningAdminMutations,
} from './use-planning-admin-mutations';
import type {
  ListCycles200Counts,
  ListCycles200Next,
} from '@/infrastructure/api/churchAPI.schemas';
import { ENTRY_GATE_STALE_TIME_MS } from '@/shared/utils/entry-gate-cache';
import { adminApi } from '@/utils/api-instances';

export interface SelectCycleInput {
  cycleId: string;
}

export interface UsePlanningAdminResult {
  isAccessDenied: boolean;
  cycles: CycleSummary[];
  /** The server's per-state counts of every Cycle; null until they load. */
  cycleCounts: ListCycles200Counts | null;
  /** The month to plan next; preloaded with the route, so stable from first paint. */
  cycleNext: ListCycles200Next | null;
  templates: PlanningTemplateSummary[];
  selectedCycleId: string | null;
  selectedCycle: SelectedCycle | null;
  /** Every owned Event, cancelled ones included. */
  cycleEvents: CycleEventGroup[];
  /** The server's counts of what is still planned; null until they load. */
  plannedCounts: CyclePlannedCounts | null;
  cyclesLoading: boolean;
  /** The list read failed for a reason other than missing access. */
  cyclesError: boolean;
  refetchCycles: () => void;
  templatesLoading: boolean;
  cycleDetailsLoading: boolean;
  cycleDetailsError: unknown;
  refetchCycleDetails: () => void;
  deleteEventTimeBlockPending: boolean;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleClearSelectedCycle: () => void;
  handleDeleteEventTimeBlock: (input: DeleteEventTimeBlockInput) => void;
}

export function usePlanningAdmin(): UsePlanningAdminResult {
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  const cyclesQuery = useQuery({
    queryKey: ['cycles'],
    queryFn: () => adminApi.listCycles(),
    staleTime: ENTRY_GATE_STALE_TIME_MS,
  });
  const templatesQuery = useQuery({
    queryKey: TEMPLATE_LIST_QUERY_KEY,
    queryFn: () => adminApi.listEventTemplates(),
  });
  const cycleDetailsQuery = useQuery({
    queryKey: ['cycle-details', selectedCycleId],
    queryFn: () =>
      adminApi.getCycle(getSelectedCycleIdOrThrow({ selectedCycleId })),
    enabled: Boolean(selectedCycleId),
  });

  const cycles = cyclesQuery.data?.cycles ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const selectedCycle = cycleDetailsQuery.data?.cycle ?? null;
  const cycleEvents = cycleDetailsQuery.data?.events ?? [];

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
  });

  return {
    isAccessDenied,
    cycles,
    cycleCounts: cyclesQuery.data?.counts ?? null,
    cycleNext: cyclesQuery.data?.next ?? null,
    templates,
    selectedCycleId,
    selectedCycle,
    cycleEvents,
    plannedCounts: cycleDetailsQuery.data?.counts ?? null,
    cyclesLoading: cyclesQuery.isLoading,
    cyclesError: cyclesQuery.isError && !isAccessDenied,
    refetchCycles: () => void cyclesQuery.refetch(),
    templatesLoading: templatesQuery.isLoading,
    cycleDetailsLoading: cycleDetailsQuery.isLoading,
    cycleDetailsError: cycleDetailsQuery.error,
    refetchCycleDetails: () => {
      void cycleDetailsQuery.refetch();
    },
    deleteEventTimeBlockPending: mutationHandlers.deleteEventTimeBlockPending,
    handleSelectCycle,
    handleClearSelectedCycle: () => setSelectedCycleId(null),
    handleDeleteEventTimeBlock: mutationHandlers.handleDeleteEventTimeBlock,
  };
}
