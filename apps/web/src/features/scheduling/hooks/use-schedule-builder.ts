import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { mapAvailabilityStatus } from '../utils/availability-status';
import type { CreateAssignmentBody } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export interface AssignParams {
  slotId: string;
  volunteerId: string;
  roleId: string;
  allowOverride?: boolean;
  overrideReason?: string;
}

interface DeleteAssignmentParams {
  assignmentId: string;
}

interface PublishEventParams {
  eventId: string;
}

const BUILDER_QUERY_KEY = ['schedule-builder'] as const;

function computeAvailabilityStatus(
  volunteerId: string,
  availability: {
    volunteerId: string;
    type: 'available' | 'unavailable';
    startTime: string;
    endTime: string;
    isAllDay: boolean;
  }[],
  eventStartMs: number,
  eventEndMs: number,
): string {
  const records = availability.filter((av) => av.volunteerId === volunteerId);
  for (const av of records) {
    const avStart = new Date(av.startTime).getTime();
    const avEnd = new Date(av.endTime).getTime();
    if (avStart <= eventEndMs && avEnd >= eventStartMs) {
      return av.type === 'unavailable' ? 'UNAVAILABLE' : 'AVAILABLE';
    }
  }
  return 'NO_RESPONSE';
}

export function useScheduleBuilder(eventId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...BUILDER_QUERY_KEY, eventId],
    queryFn: () => adminApi.getScheduleBuilderData({ eventId }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: BUILDER_QUERY_KEY });

  const data = useMemo(() => {
    if (!query.data) return undefined;
    const {
      events,
      assignments,
      availability,
      volunteers,
      roles,
      callerTeamId,
    } = query.data;
    const eventEntry = events.find((e) => e.event.id === eventId);
    if (!eventEntry) return undefined;

    const { event, slots } = eventEntry;
    const slotIds = new Set(slots.map((s) => s.id));
    const eventAssignments = assignments.filter((a) => slotIds.has(a.slotId));
    const volunteerMap = new Map(volunteers.map((v) => [v.id, v.name]));

    const assignmentsWithName = eventAssignments.map((a) => ({
      ...a,
      volunteerName: volunteerMap.get(a.volunteerId),
    }));

    const eventStartMs = new Date(event.startDate).getTime();
    const eventEndMs = new Date(event.endDate).getTime();

    const volunteerAvailability = volunteers.map((v) => ({
      volunteerId: v.id,
      volunteerName: v.name,
      status: computeAvailabilityStatus(
        v.id,
        availability,
        eventStartMs,
        eventEndMs,
      ),
      conflictReason: undefined,
    }));

    const requirements = slots.flatMap((s) => s.requirements);
    const slotsWithoutReqs = slots.map(({ requirements: _req, ...s }) => s);

    return {
      event,
      slots: slotsWithoutReqs,
      requirements,
      assignments: assignmentsWithName,
      volunteerAvailability,
      roles,
      callerTeamId,
    };
  }, [query.data, eventId]);

  const createAssignment = useMutation({
    mutationFn: (body: CreateAssignmentBody) => adminApi.createAssignment(body),
    onSettled: () => invalidate(),
  });

  const deleteAssignment = useMutation({
    mutationFn: ({ assignmentId }: DeleteAssignmentParams) =>
      adminApi.deleteAssignment(assignmentId),
    onSettled: () => invalidate(),
  });

  const publishEvent = useMutation({
    mutationFn: ({ eventId: eid }: PublishEventParams) =>
      adminApi.publishEvent(eid),
    onSettled: () => invalidate(),
  });

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

    const unavailableIds = new Set(
      data.volunteerAvailability
        .filter((v) => mapAvailabilityStatus(v.status) === 'unavailable')
        .map((v) => v.volunteerId),
    );
    const hasHard = activeAssignments.some((a) =>
      unavailableIds.has(a.volunteerId),
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
