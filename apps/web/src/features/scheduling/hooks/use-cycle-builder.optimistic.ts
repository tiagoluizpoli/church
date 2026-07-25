import type {
  CreateParticipationAssignmentBody,
  GetCycleBuilderData200,
  GetCycleBuilderData200EventsItemSlotsItemShiftsItem,
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem,
  GetCycleBuilderData200EventsItemSlotsItemSlot,
} from '@/infrastructure/api/churchAPI.schemas';
import { randomId } from '@/shared/utils/id';

/**
 * Pure cache transforms for the cycle-builder query. They rewrite the raw
 * server payload (not the mapped view model) because that is what React Query
 * stores and what `mapCycleBuilderData` derives everything else from: counts,
 * fill ratios, volunteer names and the eligibility rail all follow for free.
 */
export type CycleBuilderQueryData = GetCycleBuilderData200;

type CycleBuilderRawShift = GetCycleBuilderData200EventsItemSlotsItemShiftsItem;
type CycleBuilderRawSlot = GetCycleBuilderData200EventsItemSlotsItemSlot;
type CycleBuilderRawAssignment =
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem;

/**
 * Marks a row the client invented while a create is in flight. The server owns
 * real assignment ids, so anything that sends an id back to the API must treat
 * a prefixed row as not-yet-persisted.
 */
export const OPTIMISTIC_ASSIGNMENT_ID_PREFIX = 'optimistic:';

interface IsOptimisticAssignmentIdInput {
  assignmentId: string;
}

export function isOptimisticAssignmentId({
  assignmentId,
}: IsOptimisticAssignmentIdInput): boolean {
  return assignmentId.startsWith(OPTIMISTIC_ASSIGNMENT_ID_PREFIX);
}

export function createOptimisticAssignmentId(): string {
  return `${OPTIMISTIC_ASSIGNMENT_ID_PREFIX}${randomId()}`;
}

interface MapShiftInput {
  shift: CycleBuilderRawShift;
  slot: CycleBuilderRawSlot;
}

interface MapCycleBuilderShiftsInput {
  data: CycleBuilderQueryData;
  mapShift: (input: MapShiftInput) => CycleBuilderRawShift;
}

function mapCycleBuilderShifts({
  data,
  mapShift,
}: MapCycleBuilderShiftsInput): CycleBuilderQueryData {
  return {
    ...data,
    events: data.events.map((event) => ({
      ...event,
      slots: event.slots.map((slotItem) => ({
        ...slotItem,
        shifts: slotItem.shifts.map((shift) =>
          mapShift({ shift, slot: slotItem.slot }),
        ),
      })),
    })),
  };
}

export interface AddOptimisticAssignmentInput {
  data: CycleBuilderQueryData;
  assignmentId: string;
  shiftId: string;
  body: CreateParticipationAssignmentBody;
  assignedAt: string;
}

export function addOptimisticAssignment({
  data,
  assignmentId,
  shiftId,
  body,
  assignedAt,
}: AddOptimisticAssignmentInput): CycleBuilderQueryData {
  return mapCycleBuilderShifts({
    data,
    mapShift: ({ shift, slot }) => {
      if (shift.shift.id !== shiftId) return shift;
      const optimistic: CycleBuilderRawAssignment = {
        id: assignmentId,
        churchId: slot.churchId,
        slotId: shift.shift.timeSlotId,
        participationId: shift.shift.participationId,
        shiftId: shift.shift.id,
        volunteerId: body.volunteerId,
        roleId: body.roleId,
        // The server creates assignments as `pending`; anything else would
        // change the assigned counts the board renders from this row.
        status: 'pending',
        reason: body.override?.reason,
        assignedAt,
      };
      return { ...shift, assignments: [...shift.assignments, optimistic] };
    },
  });
}

export interface RemoveOptimisticAssignmentInput {
  data: CycleBuilderQueryData;
  assignmentId: string;
}

export function removeOptimisticAssignment({
  data,
  assignmentId,
}: RemoveOptimisticAssignmentInput): CycleBuilderQueryData {
  return mapCycleBuilderShifts({
    data,
    mapShift: ({ shift }) => {
      if (!shift.assignments.some((item) => item.id === assignmentId)) {
        return shift;
      }
      return {
        ...shift,
        assignments: shift.assignments.filter(
          (item) => item.id !== assignmentId,
        ),
      };
    },
  });
}

export interface ReplaceOptimisticAssignmentVolunteerInput {
  data: CycleBuilderQueryData;
  assignmentId: string;
  volunteerId: string;
  reason: string;
}

/**
 * A reassign is a delete plus a create on the server, so the row comes back
 * with a new id. Swapping the volunteer in place is the closest the client can
 * get without inventing an id; the reconcile refetch replaces the row.
 */
export function replaceOptimisticAssignmentVolunteer({
  data,
  assignmentId,
  volunteerId,
  reason,
}: ReplaceOptimisticAssignmentVolunteerInput): CycleBuilderQueryData {
  return mapCycleBuilderShifts({
    data,
    mapShift: ({ shift }) => {
      if (!shift.assignments.some((item) => item.id === assignmentId)) {
        return shift;
      }
      return {
        ...shift,
        assignments: shift.assignments.map((item) =>
          item.id === assignmentId ? { ...item, volunteerId, reason } : item,
        ),
      };
    },
  });
}
