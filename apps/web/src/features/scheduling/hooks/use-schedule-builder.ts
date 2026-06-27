import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { mapAvailabilityStatus } from '../utils/availability-status';
import { trpc } from '@/utils/trpc';

export interface AssignParams {
  slotId: string;
  volunteerId: string;
  roleId: string;
  allowOverride?: boolean;
  overrideReason?: string;
}

/**
 * Central data + mutation hook for the schedule builder. Wraps the
 * getScheduleBuilderData query and exposes assignment / publish mutations.
 * Mutations invalidate the builder query so the grid, sidebar, and staffing
 * meters stay consistent.
 */
export function useScheduleBuilder(eventId: string) {
  const queryClient = useQueryClient();
  const queryOptions = trpc.adminLeader.getScheduleBuilderData.queryOptions({
    eventId,
  });
  const query = useQuery(queryOptions);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });

  const createAssignment = useMutation(
    trpc.adminLeader.createAssignment.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );

  const deleteAssignment = useMutation(
    trpc.adminLeader.deleteAssignment.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );

  const publishEvent = useMutation(
    trpc.adminLeader.publishEvent.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );

  const data = query.data;

  // Event-level fill ratio = total assignments / total required count.
  const { eventFillRatio, hasHardViolations } = useMemo(() => {
    if (!data) return { eventFillRatio: 0, hasHardViolations: false };
    const totalRequired = data.requirements.reduce(
      (sum, r) => sum + r.requiredCount,
      0,
    );
    const activeAssignments = data.assignments.filter(
      (a) => a.status !== 'cancelled' && a.status !== 'declined',
    );
    const fill =
      totalRequired === 0 ? 0 : activeAssignments.length / totalRequired;

    // A hard violation = an assignment to a volunteer who is unavailable.
    const unavailableVolunteerIds = new Set(
      data.volunteerAvailability
        .filter((v) => mapAvailabilityStatus(v.status) === 'unavailable')
        .map((v) => v.volunteerId),
    );
    const hasHard = activeAssignments.some((a) =>
      unavailableVolunteerIds.has(a.volunteerId),
    );

    return { eventFillRatio: fill, hasHardViolations: hasHard };
  }, [data]);

  return {
    query,
    data,
    refetch: query.refetch,
    invalidate,
    createAssignment,
    deleteAssignment,
    publishEvent,
    eventFillRatio,
    hasHardViolations,
    callerTeamId: data?.callerTeamId ?? null,
  };
}

export type ScheduleBuilderData = NonNullable<
  ReturnType<typeof useScheduleBuilder>['data']
>;
