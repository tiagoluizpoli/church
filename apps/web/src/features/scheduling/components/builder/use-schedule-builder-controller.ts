import {
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAutoSave } from '../../hooks/use-auto-save';
import type { AssignParams } from '../../hooks/use-schedule-builder';
import { mapAvailabilityStatus } from '../../utils/availability-status';
import type { ConflictStatus } from './assignment-chip';
import type {
  ActiveDraggedVolunteer,
  OverrideState,
  SubstitutionState,
  UseScheduleBuilderControllerParams,
} from './use-schedule-builder-controller.types';
import { useScheduleBuilderDerivedData } from './use-schedule-builder-derived-data';
import { useSlotManagement } from './use-slot-management';
import { trpc } from '@/utils/trpc';

export function useScheduleBuilderController({
  builderData,
  eventId,
  format,
  invalidate,
  refetch,
  createAssignment,
  deleteAssignment,
  publishEvent,
}: UseScheduleBuilderControllerParams) {
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [substitution, setSubstitution] = useState<SubstitutionState | null>(
    null,
  );
  const [selectedSidebarVolunteerId, setSelectedSidebarVolunteerId] = useState<
    string | undefined
  >(undefined);
  const [activeDraggedVolunteer, setActiveDraggedVolunteer] =
    useState<ActiveDraggedVolunteer | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const upsertRequirement = useMutation(
    trpc.adminLeader.upsertSlotRequirement.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const sendReminder = useMutation(
    trpc.adminLeader.sendReminder.mutationOptions(),
  );

  const saveStatus = useAutoSave([
    createAssignment,
    deleteAssignment,
    upsertRequirement,
  ]);
  const sensors = useSensors(useSensor(PointerSensor));
  const { pickerVolunteers, sidebarVolunteers } = useScheduleBuilderDerivedData(
    {
      builderData,
    },
  );
  const slotManagement = useSlotManagement({
    builderData,
    eventId,
    invalidate,
    refetch,
  });

  const slotLabelOf = (slotId: string): string => {
    const slot = builderData.slots.find((item) => item.id === slotId);
    if (!slot) return '';

    return (
      slot.label ??
      `${format(slot.startTime, 'p')}–${format(slot.endTime, 'p')}`
    );
  };

  const conflictTypeOf = (volunteerId: string): ConflictStatus => {
    const availability = builderData.volunteerAvailability.find(
      (item) => item.volunteerId === volunteerId,
    );
    return availability &&
      mapAvailabilityStatus(availability.status) === 'unavailable'
      ? 'unavailable'
      : 'double_booked';
  };

  const volunteerNameOf = (volunteerId: string): string =>
    builderData.volunteerAvailability.find(
      (item) => item.volunteerId === volunteerId,
    )?.volunteerName ?? volunteerId;

  const requiredCountOf = (slotId: string, roleId: string): number =>
    builderData.requirements.find(
      (item) => item.slotId === slotId && item.roleId === roleId,
    )?.requiredCount ?? 0;

  const handleAssign = async ({
    slotId,
    roleId,
    volunteerId,
  }: AssignParams) => {
    setSelectedSidebarVolunteerId(undefined);
    const result = await createAssignment.mutateAsync({
      timeSlotId: slotId,
      volunteerId,
      roleId,
    });

    if (result && 'conflictReport' in result && result.conflictReport) {
      setOverride({
        slotId,
        roleId,
        volunteerId,
        volunteerName: volunteerNameOf(volunteerId),
        conflictType: conflictTypeOf(volunteerId),
        slotLabel: slotLabelOf(slotId),
      });
    }
  };

  const handleConfirmOverride = async (reason: string) => {
    if (!override) return;

    const pendingOverride = override;
    setOverride(null);

    try {
      await createAssignment.mutateAsync({
        timeSlotId: pendingOverride.slotId,
        volunteerId: pendingOverride.volunteerId,
        roleId: pendingOverride.roleId,
        allowOverride: true,
        overrideReason: reason,
      });
    } catch (error) {
      setOverride(pendingOverride);
      throw error;
    }
  };

  const handleSubstituteSelect = async (newVolunteerId: string) => {
    if (!substitution) return;

    await deleteAssignment.mutateAsync({
      assignmentId: substitution.declinedAssignmentId,
    });

    await handleAssign({
      slotId:
        builderData.assignments.find(
          (assignment) => assignment.id === substitution.declinedAssignmentId,
        )?.slotId ?? '',
      roleId: substitution.roleId,
      volunteerId: newVolunteerId,
    });

    setSubstitution(null);
  };

  const handleIncrement = (slotId: string, roleId: string) =>
    upsertRequirement.mutate({
      timeSlotId: slotId,
      roleId,
      count: requiredCountOf(slotId, roleId) + 1,
    });

  const handleDecrement = (slotId: string, roleId: string) => {
    const nextCount = Math.max(1, requiredCountOf(slotId, roleId) - 1);
    upsertRequirement.mutate({ timeSlotId: slotId, roleId, count: nextCount });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!data?.volunteerId || !data?.volunteerName || !data?.status) {
      setActiveDraggedVolunteer(null);
      return;
    }

    setActiveDraggedVolunteer({
      volunteerId: data.volunteerId as string,
      volunteerName: data.volunteerName as string,
      status: data.status as ActiveDraggedVolunteer['status'],
      workloadCount: (data.workloadCount as number | undefined) ?? 0,
      conflictReason: data.conflictReason as string | undefined,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDraggedVolunteer(null);
    const volunteerId = event.active.data.current?.volunteerId as
      | string
      | undefined;
    const dropData = event.over?.data.current as
      | { slotId: string; roleId: string }
      | undefined;

    if (volunteerId && dropData) {
      void handleAssign({
        slotId: dropData.slotId,
        roleId: dropData.roleId,
        volunteerId,
      });
    }
  };

  const handlePublish = () =>
    publishEvent.mutate(
      { eventId },
      {
        onSuccess: () => toast.success('Event published'),
      },
    );

  const handleSendReminder = () =>
    sendReminder.mutate(
      { eventId },
      {
        onSuccess: (result) =>
          toast.success(`Reminder sent to ${result.notifiedCount} volunteers`),
        onError: (error) => toast.error(error.message),
      },
    );

  return {
    auditOpen,
    deleteAssignment,
    ...slotManagement,
    handleAssign,
    handleConfirmOverride,
    handleDecrement,
    handleDragStart,
    handleDragEnd,
    handleIncrement,
    handleOpenAuditLog: () => setAuditOpen(true),
    handleOpenPrintExport: () => toast.info('Print / Export coming soon'),
    handleOverrideRequest: (
      slotId: string,
      roleId: string,
      volunteerId: string,
    ) =>
      setOverride({
        slotId,
        roleId,
        volunteerId,
        volunteerName: volunteerNameOf(volunteerId),
        conflictType: conflictTypeOf(volunteerId),
        slotLabel: slotLabelOf(slotId),
      }),
    handlePublish,
    handleRefresh: () => refetch(),
    handleSendReminder,
    handleSubstituteRequest: (assignmentId: string, roleId: string) => {
      const assignment = builderData.assignments.find(
        (item) => item.id === assignmentId,
      );
      setSubstitution({
        declinedAssignmentId: assignmentId,
        declinedVolunteerId: assignment?.volunteerId ?? '',
        declinedVolunteerName: assignment?.volunteerName ?? '',
        roleId,
      });
    },
    handleSubstituteSelect,
    invalidate,
    activeDraggedVolunteer,
    override,
    pickerVolunteers,
    saveStatus,
    selectedSidebarVolunteerId,
    sensors,
    sendReminder,
    setActiveDraggedVolunteer,
    setAuditOpen,
    setOverride,
    setSelectedSidebarVolunteerId,
    setSubstitution,
    sidebarVolunteers,
    substitution,
  };
}
