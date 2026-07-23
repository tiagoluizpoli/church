import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import type {
  CreateParticipationAssignmentBody,
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem,
  ReassignParticipationAssignmentBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

interface UseCycleBuilderParams {
  cycleId: string;
  ministryId: string;
}

interface CreateCycleAssignmentParams {
  shiftId: string;
  body: CreateParticipationAssignmentBody;
}

interface ReassignCycleAssignmentParams {
  assignmentId: string;
  body: ReassignParticipationAssignmentBody;
}

export interface CycleBuilderRequirementSummary {
  roleId: string;
  teamId?: string;
  requiredCount: number;
}

export interface CycleBuilderEligibleVolunteerSummary {
  volunteerId: string;
  volunteerName: string;
  isAvailable: boolean;
  hasConflict: boolean;
  lastServedAt?: string;
  qualifiedRoleIds: string[];
}

interface CycleBuilderAssignmentDetails {
  volunteerName?: string;
}

interface RequiredCountShift {
  requirements: CycleBuilderRequirementSummary[];
}

interface AssignedCountAssignment {
  status: string;
}

interface AssignedCountShift {
  assignments: AssignedCountAssignment[];
}

interface RequiredCountSlot {
  included: boolean;
  shifts: RequiredCountShift[];
}

interface AssignedCountSlot {
  included: boolean;
  shifts: AssignedCountShift[];
}

export interface CycleBuilderShiftSummary {
  shiftId: string;
  slotId: string;
  label?: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  assignedCount: number;
  requirements: CycleBuilderRequirementSummary[];
  assignments: CycleBuilderAssignment[];
  eligibleVolunteerCount: number;
  eligibleVolunteers: CycleBuilderEligibleVolunteerSummary[];
}

export type CycleBuilderAssignment =
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem &
    CycleBuilderAssignmentDetails;

export interface CycleBuilderSlotSummary {
  slotId: string;
  label?: string;
  startTime: string;
  endTime: string;
  included: boolean;
  requiredCount: number;
  assignedCount: number;
  shiftCount: number;
  shifts: CycleBuilderShiftSummary[];
}

export interface CycleBuilderEventSummary {
  participationId: string;
  state: string;
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  eventType: string;
  fillRatio: number;
  requiredCount: number;
  assignedCount: number;
  slotCount: number;
  slots: CycleBuilderSlotSummary[];
}

export interface CycleBuilderData {
  events: CycleBuilderEventSummary[];
  assignments: CycleBuilderAssignment[];
  roles: CycleBuilderRoleOption[];
}

export interface CycleBuilderRoleOption {
  id: string;
  name: string;
}

const CYCLE_BUILDER_QUERY_KEY = ['cycle-builder'] as const;

function sumRequiredCount(slots: RequiredCountSlot[]): number {
  return slots.reduce((total, slot) => {
    if (!slot.included) return total;
    return (
      total +
      slot.shifts.reduce(
        (slotTotal, shift) =>
          slotTotal +
          shift.requirements.reduce(
            (shiftTotal, requirement) => shiftTotal + requirement.requiredCount,
            0,
          ),
        0,
      )
    );
  }, 0);
}

function sumAssignedCount(slots: AssignedCountSlot[]): number {
  return slots.reduce((total, slot) => {
    if (!slot.included) return total;
    return (
      total +
      slot.shifts.reduce(
        (slotTotal, shift) =>
          slotTotal +
          shift.assignments.filter(
            (assignment) =>
              assignment.status !== 'declined' &&
              assignment.status !== 'cancelled',
          ).length,
        0,
      )
    );
  }, 0);
}

function mapCycleBuilderData(
  data: Awaited<ReturnType<typeof adminApi.getCycleBuilderData>>,
): CycleBuilderData {
  const volunteerNames = new Map<string, string>();
  for (const item of data.events) {
    for (const slotItem of item.slots) {
      for (const shiftItem of slotItem.shifts) {
        for (const volunteer of shiftItem.eligibleVolunteers) {
          volunteerNames.set(volunteer.volunteerId, volunteer.volunteerName);
        }
      }
    }
  }

  const assignments = data.events.flatMap((item) =>
    item.slots.flatMap((slotItem) =>
      slotItem.shifts.flatMap((shiftItem) =>
        shiftItem.assignments.map((assignment) => ({
          ...assignment,
          volunteerName: volunteerNames.get(assignment.volunteerId),
        })),
      ),
    ),
  );
  const events = data.events.map((item) => {
    const slots = item.slots.map((slotItem) => {
      const shifts = slotItem.shifts.map((shiftItem) => {
        const requiredCount = shiftItem.requirements.reduce(
          (total, requirement) => total + requirement.requiredCount,
          0,
        );
        const assignedCount = shiftItem.assignments.filter(
          (assignment) =>
            assignment.status !== 'declined' &&
            assignment.status !== 'cancelled',
        ).length;

        return {
          shiftId: shiftItem.shift.id,
          slotId: slotItem.slot.id,
          label: shiftItem.shift.label,
          startTime: shiftItem.shift.startTime,
          endTime: shiftItem.shift.endTime,
          requiredCount,
          assignedCount,
          requirements: shiftItem.requirements,
          assignments: shiftItem.assignments.map((assignment) => ({
            ...assignment,
            volunteerName: volunteerNames.get(assignment.volunteerId),
          })),
          eligibleVolunteerCount: shiftItem.eligibleVolunteers.length,
          eligibleVolunteers: shiftItem.eligibleVolunteers,
        };
      });

      const requiredCount = shifts.reduce(
        (total, shift) => total + shift.requiredCount,
        0,
      );
      const assignedCount = shifts.reduce(
        (total, shift) => total + shift.assignedCount,
        0,
      );

      return {
        slotId: slotItem.slot.id,
        label: slotItem.slot.label,
        startTime: slotItem.slot.startTime,
        endTime: slotItem.slot.endTime,
        included: slotItem.included,
        requiredCount,
        assignedCount,
        shiftCount: shifts.length,
        shifts,
      };
    });

    const requiredCount = sumRequiredCount(item.slots);
    const assignedCount = sumAssignedCount(item.slots);

    return {
      participationId: item.participation.id,
      state: item.participation.state,
      eventId: item.event.id,
      title: item.event.title,
      startDate: item.event.startDate,
      endDate: item.event.endDate,
      status: item.event.status,
      eventType: item.event.eventType,
      fillRatio: requiredCount === 0 ? 0 : assignedCount / requiredCount,
      requiredCount,
      assignedCount,
      slotCount: slots.filter((slot) => slot.included).length,
      slots,
    };
  });

  return { events, assignments, roles: data.roles };
}

export function useCycleBuilder({
  cycleId,
  ministryId,
}: UseCycleBuilderParams) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...CYCLE_BUILDER_QUERY_KEY, cycleId, ministryId],
    queryFn: () => adminApi.getCycleBuilderData(cycleId, { ministryId }),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const publish = useMutation({
    mutationFn: (confirmBelowFull: boolean) =>
      adminApi.publishCycle(cycleId, { confirmBelowFull }, { ministryId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: [...CYCLE_BUILDER_QUERY_KEY, cycleId, ministryId],
      });
      // Publishing is the most consequential action in the builder and was the
      // only mutation here that reported nothing back. `published` is false
      // when the cycle is below its staffing target and the leader has not
      // confirmed, so the two outcomes must read differently.
      if (result.published) {
        toast.success('Cycle published');
        return;
      }
      toast.warning('Cycle not published — confirm to publish below target.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Publish failed');
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: [...CYCLE_BUILDER_QUERY_KEY, cycleId, ministryId],
    });

  const createAssignment = useMutation({
    mutationFn: ({ shiftId, body }: CreateCycleAssignmentParams) =>
      adminApi.createParticipationAssignment(shiftId, body),
    onSettled: invalidate,
  });

  const deleteAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      adminApi.deleteParticipationAssignment(assignmentId),
    onSettled: invalidate,
  });

  const reassignAssignment = useMutation({
    mutationFn: ({ assignmentId, body }: ReassignCycleAssignmentParams) =>
      adminApi.reassignParticipationAssignment(assignmentId, body),
    onSettled: invalidate,
  });

  const data = useMemo(() => {
    if (!query.data) return undefined;
    return mapCycleBuilderData(query.data);
  }, [query.data]);

  return {
    query,
    data,
    publish,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
  };
}
