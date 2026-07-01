import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AvailabilitySaveInput } from '../components/availability-form';
import { getInitialExpandedAssignmentGroupId } from '../lib/assignment-grouping';
import {
  type DashboardAssignmentGroup,
  type DashboardSnapshot,
  mapAvailabilitySlots,
} from '../lib/dashboard-mappers';
import {
  getDashboardSnapshotQueryConfig,
  getMinistryScheduleQueryConfig,
  writeCachedDashboardSnapshot,
  writeCachedMinistrySchedule,
} from '../lib/dashboard-query-options';
import { useOnlineState } from './use-online-state';
import { queryClient, trpc } from '@/utils/trpc';

export interface UseVolunteerDashboardOptions {
  initialSection?:
    | 'availability'
    | 'assignments'
    | 'notifications'
    | 'ministry_schedule';
  initialEventId?: string;
  initialAssignmentId?: string;
  initialMinistryId?: string;
}

export interface AssignmentResponseMutationInput {
  assignmentId: string;
  response: 'confirmed' | 'declined';
}

function shouldKeepExpandedGroup(
  groups: DashboardAssignmentGroup[],
  expandedEventId: string | undefined,
): boolean {
  return expandedEventId
    ? groups.some((group) => group.eventId === expandedEventId)
    : false;
}

export function useVolunteerDashboard({
  initialSection,
  initialEventId,
  initialAssignmentId,
  initialMinistryId,
}: UseVolunteerDashboardOptions) {
  const isOnline = useOnlineState();
  const dashboardQuery = useQuery({
    ...trpc.volunteer.getVolunteerDashboard.queryOptions(),
    ...getDashboardSnapshotQueryConfig(isOnline),
  });
  const dashboard = dashboardQuery.data as DashboardSnapshot | undefined;
  const availabilityTasks = dashboard?.availabilityTasks ?? [];
  const assignmentGroups = dashboard?.upcomingAssignmentGroups ?? [];

  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    initialSection === 'availability' ? initialEventId : undefined,
  );
  const [expandedAssignmentEventId, setExpandedAssignmentEventId] = useState<
    string | undefined
  >(undefined);
  const [
    hasInitializedAssignmentExpansion,
    setHasInitializedAssignmentExpansion,
  ] = useState(false);
  const [selectedMinistryId, setSelectedMinistryId] = useState<
    string | undefined
  >(initialSection === 'ministry_schedule' ? initialMinistryId : undefined);

  useEffect(() => {
    if (
      selectedEventId &&
      availabilityTasks.some((task) => task.eventId === selectedEventId)
    ) {
      return;
    }

    if (initialSection === 'availability' && availabilityTasks.length > 0) {
      setSelectedEventId(initialEventId ?? availabilityTasks[0]?.eventId);
      return;
    }

    if (
      selectedEventId &&
      availabilityTasks.every((task) => task.eventId !== selectedEventId)
    ) {
      setSelectedEventId(undefined);
    }
  }, [availabilityTasks, initialEventId, initialSection, selectedEventId]);

  useEffect(() => {
    const ministryOptions = dashboard?.ministryOptions ?? [];
    const defaultMinistryId = dashboard?.defaultMinistryId;

    if (
      selectedMinistryId &&
      ministryOptions.some((ministry) => ministry.id === selectedMinistryId)
    ) {
      return;
    }

    if (
      initialSection === 'ministry_schedule' &&
      initialMinistryId &&
      ministryOptions.some((ministry) => ministry.id === initialMinistryId)
    ) {
      setSelectedMinistryId(initialMinistryId);
      return;
    }

    if (defaultMinistryId) {
      setSelectedMinistryId(defaultMinistryId);
      return;
    }

    setSelectedMinistryId(ministryOptions[0]?.id);
  }, [
    dashboard?.defaultMinistryId,
    dashboard?.ministryOptions,
    initialMinistryId,
    initialSection,
    selectedMinistryId,
  ]);

  useEffect(() => {
    if (!hasInitializedAssignmentExpansion) {
      if (assignmentGroups.length === 0) {
        return;
      }

      const deepLinkedGroup =
        initialAssignmentId != null
          ? assignmentGroups.find((group) =>
              group.assignments.some(
                (a) => a.assignmentId === initialAssignmentId,
              ),
            )
          : undefined;

      setExpandedAssignmentEventId(
        deepLinkedGroup?.eventId ??
          getInitialExpandedAssignmentGroupId(assignmentGroups),
      );
      setHasInitializedAssignmentExpansion(true);
      return;
    }

    if (shouldKeepExpandedGroup(assignmentGroups, expandedAssignmentEventId)) {
      return;
    }

    if (expandedAssignmentEventId) {
      setExpandedAssignmentEventId(
        getInitialExpandedAssignmentGroupId(assignmentGroups),
      );
    }
  }, [
    assignmentGroups,
    expandedAssignmentEventId,
    hasInitializedAssignmentExpansion,
    initialAssignmentId,
  ]);

  const selectedTask = availabilityTasks.find(
    (task) => task.eventId === selectedEventId,
  );

  const availabilityQuery = useQuery({
    ...trpc.volunteer.getMyAvailability.queryOptions({
      eventId: selectedEventId,
    }),
    enabled: selectedEventId != null,
  });

  const ministryScheduleQuery = useQuery({
    ...trpc.volunteer.getMinistrySchedule.queryOptions({
      ministryId: selectedMinistryId ?? '',
    }),
    ...getMinistryScheduleQueryConfig(selectedMinistryId, isOnline),
    enabled: selectedMinistryId != null,
  });

  useEffect(() => {
    if (!dashboard) {
      return;
    }

    writeCachedDashboardSnapshot(dashboard);
  }, [dashboard]);

  useEffect(() => {
    if (!selectedMinistryId || !ministryScheduleQuery.data) {
      return;
    }

    writeCachedMinistrySchedule(selectedMinistryId, ministryScheduleQuery.data);
  }, [ministryScheduleQuery.data, selectedMinistryId]);

  const invalidateVolunteerDashboard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.volunteer.getVolunteerDashboard.queryOptions().queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey:
          trpc.volunteer.getMyUpcomingAssignments.queryOptions().queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.volunteer.getMyAvailability.queryOptions({
          eventId: selectedEventId,
        }).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.volunteer.getMinistrySchedule.queryOptions({
          ministryId: selectedMinistryId ?? '',
        }).queryKey,
      }),
    ]);
  };

  const saveAvailability = useMutation(
    trpc.volunteer.upsertAvailability.mutationOptions({
      onSuccess: async (result) => {
        toast.success('Availability saved.');
        await invalidateVolunteerDashboard();

        if (result.completionState === 'complete') {
          setSelectedEventId(undefined);
        }
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const respondToAssignment = useMutation(
    trpc.volunteer.respondToAssignment.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.status === 'confirmed'
            ? 'Assignment confirmed.'
            : 'Leader notified that you cannot serve.',
        );
        await invalidateVolunteerDashboard();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const handleSaveAvailability = (input: AvailabilitySaveInput) => {
    if (!selectedEventId) {
      return;
    }

    saveAvailability.mutate({
      eventId: selectedEventId,
      answers: input.answers,
      confirmOverlap: input.confirmOverlap,
    });
  };

  const handleRespondToAssignment = (
    input: AssignmentResponseMutationInput,
  ) => {
    if (!isOnline) {
      toast.error(
        'Assignment responses stay blocked until your connection returns.',
      );
      return;
    }

    respondToAssignment.mutate(input);
  };

  const handleToggleAssignmentGroup = (eventId: string) => {
    setExpandedAssignmentEventId((currentEventId) =>
      currentEventId === eventId ? undefined : eventId,
    );
  };

  return {
    assignmentGroups,
    availabilitySlots: mapAvailabilitySlots(availabilityQuery.data),
    availabilityTasks,
    expandedAssignmentEventId,
    handleRespondToAssignment,
    handleSaveAvailability,
    handleToggleAssignmentGroup,
    invalidateVolunteerDashboard,
    isOnline,
    lastUpdatedAt: dashboard?.fetchedAt,
    ministryOptions: dashboard?.ministryOptions ?? [],
    ministrySchedule: ministryScheduleQuery.data,
    ministryScheduleQuery,
    notificationUnreadCount: dashboard?.notificationUnreadCount ?? 0,
    openAssignmentGroup: setExpandedAssignmentEventId,
    respondToAssignment,
    saveAvailability,
    selectedMinistryId,
    selectedTask,
    setSelectedMinistryId,
    setSelectedEventId,
  };
}
