import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type { ListSchedulesParams } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

/** Root of every Schedule read: invalidating it refreshes the list and each single Schedule. */
export const SCHEDULES_QUERY_KEY = ['prepare-schedules'] as const;

export interface ScheduleFilters
  extends Omit<ListSchedulesParams, 'cursor' | 'limit' | 'attention'> {
  /** The Schedules that need the leader (Home's Leadership list), in place of a stage. */
  attention?: true;
}

interface UseScheduleListInput {
  filters: ScheduleFilters;
}

/** Server-ordered pages of the caller's Schedules under the filters; `current` is the server default. */
export function useScheduleList({ filters }: UseScheduleListInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useInfiniteQuery({
    queryKey: [...SCHEDULES_QUERY_KEY, 'list', churchId, filters],
    // Keeps the chips and pickers on screen while a new filter set loads.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const { attention, ...rest } = filters;
      const params = attention ? { ...rest, attention: 'true' } : rest;
      return adminApi.listSchedules(
        pageParam ? { ...params, cursor: pageParam } : params,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
}

interface UseScheduleInput {
  ministryId: string | undefined;
  cycleId: string | undefined;
  enabled?: boolean;
}

/** One Schedule of a Sent or Past Cycle; 404 when it is outside the caller's Ministries. */
export function useSchedule({
  ministryId,
  cycleId,
  enabled = true,
}: UseScheduleInput) {
  return useQuery({
    queryKey: [...SCHEDULES_QUERY_KEY, 'one', ministryId, cycleId],
    queryFn: () => adminApi.getSchedule(ministryId ?? '', cycleId ?? ''),
    enabled: enabled && ministryId !== undefined && cycleId !== undefined,
    retry: false,
  });
}
