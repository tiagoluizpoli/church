import { useMemo } from 'react';
import type { ScheduleBuilderData } from '../../hooks/use-schedule-builder';
import { mapAvailabilityStatus } from '../../utils/availability-status';
import type {
  PickerVolunteerList,
  SidebarVolunteer,
} from './use-schedule-builder-controller.types';

interface UseScheduleBuilderDerivedDataParams {
  builderData: ScheduleBuilderData;
}

export function useScheduleBuilderDerivedData({
  builderData,
}: UseScheduleBuilderDerivedDataParams) {
  const pickerVolunteers = useMemo<PickerVolunteerList>(
    () =>
      builderData.volunteerAvailability.map((item) => ({
        id: item.volunteerId,
        name: item.volunteerName,
        availabilityStatus: mapAvailabilityStatus(item.status),
        alreadyAssignedCount: builderData.assignments.filter(
          (assignment) =>
            assignment.volunteerId === item.volunteerId &&
            assignment.status !== 'cancelled' &&
            assignment.status !== 'declined',
        ).length,
      })),
    [builderData.assignments, builderData.volunteerAvailability],
  );

  const sidebarVolunteers = useMemo<SidebarVolunteer[]>(
    () =>
      builderData.volunteerAvailability.map((item) => ({
        volunteerId: item.volunteerId,
        volunteerName: item.volunteerName,
        status: mapAvailabilityStatus(item.status),
        conflictReason: item.conflictReason ?? undefined,
      })),
    [builderData.volunteerAvailability],
  );

  return {
    pickerVolunteers,
    sidebarVolunteers,
  };
}
