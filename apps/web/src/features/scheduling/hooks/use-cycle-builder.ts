import { m } from '@church/i18n/messages';
import { now } from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { builderErrorMessage } from '../utils/builder/cycle-builder-error.utils';
import { countCoveredPlaces } from '../utils/builder/cycle-builder-staffing.utils';
import { isActiveAssignment } from '../utils/scheduling-rules';
import {
  type CountedEventTimeBlock,
  isStaffedEventTimeBlock,
} from '../utils/shift-verdict';
import {
  addOptimisticAssignment,
  type CycleBuilderQueryData,
  createOptimisticAssignmentId,
  removeOptimisticAssignment,
  replaceOptimisticAssignmentVolunteer,
} from './use-cycle-builder.optimistic';
import type {
  CreateParticipationAssignmentBody,
  GetCycleBuilderData200EventsItemEventTimeBlocksItemShiftsItemAssignmentsItem,
  MoveParticipationAssignmentBody,
  ReassignParticipationAssignmentBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';

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

interface MoveCycleAssignmentParams {
  assignmentId: string;
  body: MoveParticipationAssignmentBody;
}

interface OptimisticUpdateInput {
  data: CycleBuilderQueryData;
}

interface CycleBuilderOptimisticContext {
  previous?: CycleBuilderQueryData;
}

interface ApplyOptimisticInput {
  update: (input: OptimisticUpdateInput) => CycleBuilderQueryData;
}

interface RollbackOptimisticInput {
  context?: CycleBuilderOptimisticContext;
}

export interface CycleBuilderRequirementSummary {
  id: string;
  roleId: string;
  sectorName: string;
  sectorId?: string;
  peopleNeeded: number;
}

export interface CycleBuilderEligibleVolunteerSummary {
  volunteerId: string;
  volunteerName: string;
  answerState: 'available' | 'unanswered' | 'not_asked' | 'unavailable';
  conflict: {
    assignmentId: string;
    ministryName: string;
    eventTitle: string;
    startTime: string;
    endTime: string;
  } | null;
  lastServedAt?: string;
  qualifiedRoleIds: string[];
  ministryAccessLevel: AssigneeMembership['ministryAccessLevel'];
}

interface CycleBuilderAssignmentDetails {
  volunteerName?: string;
  membership?: AssigneeMembership;
}

interface PeopleNeededShift {
  requirements: CycleBuilderRequirementSummary[];
}

interface AssignedCountAssignment {
  status: string;
}

interface AssignedCountShift {
  assignments: AssignedCountAssignment[];
}

interface PeopleNeededEventTimeBlock extends CountedEventTimeBlock {
  shifts: PeopleNeededShift[];
}

interface AssignedCountEventTimeBlock extends CountedEventTimeBlock {
  shifts: AssignedCountShift[];
}

export interface CycleBuilderShiftSummary {
  shiftId: string;
  eventTimeBlockId: string;
  label?: string;
  startTime: string;
  endTime: string;
  /** Its time block or Event was cancelled: read-only, asks for nobody. */
  cancelled: boolean;
  peopleNeeded: number;
  assignedCount: number;
  requirements: CycleBuilderRequirementSummary[];
  assignments: CycleBuilderAssignment[];
  eligibleVolunteerCount: number;
  eligibleVolunteers: CycleBuilderEligibleVolunteerSummary[];
}

export type CycleBuilderAssignment =
  GetCycleBuilderData200EventsItemEventTimeBlocksItemShiftsItemAssignmentsItem &
    CycleBuilderAssignmentDetails;

export interface CycleBuilderEventTimeBlockSummary {
  eventTimeBlockId: string;
  label?: string;
  startTime: string;
  endTime: string;
  included: boolean;
  /** The time block or its Event was cancelled. */
  cancelled: boolean;
  peopleNeeded: number;
  assignedCount: number;
  shiftCount: number;
  shifts: CycleBuilderShiftSummary[];
}

export interface CycleBuilderEventSummary {
  participationId: string;
  state: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  status: string;
  fillRatio: number;
  peopleNeeded: number;
  assignedCount: number;
  eventTimeBlockCount: number;
  eventTimeBlocks: CycleBuilderEventTimeBlockSummary[];
}

export interface CycleBuilderData {
  affectedVolunteerCount?: number;
  events: CycleBuilderEventSummary[];
  assignments: CycleBuilderAssignment[];
  roles: CycleBuilderRoleOption[];
}

export interface CycleBuilderRoleOption {
  id: string;
  name: string;
}

export const CYCLE_BUILDER_QUERY_KEY = ['cycle-builder'] as const;

function sumPeopleNeeded(
  eventTimeBlocks: PeopleNeededEventTimeBlock[],
): number {
  return eventTimeBlocks.reduce((total, eventTimeBlock) => {
    if (!isStaffedEventTimeBlock(eventTimeBlock)) return total;
    return (
      total +
      eventTimeBlock.shifts.reduce(
        (eventTimeBlockTotal, shift) =>
          eventTimeBlockTotal +
          shift.requirements.reduce(
            (shiftTotal, requirement) => shiftTotal + requirement.peopleNeeded,
            0,
          ),
        0,
      )
    );
  }, 0);
}

function sumAssignedCount(
  eventTimeBlocks: AssignedCountEventTimeBlock[],
): number {
  return eventTimeBlocks.reduce((total, eventTimeBlock) => {
    if (!isStaffedEventTimeBlock(eventTimeBlock)) return total;
    return (
      total +
      eventTimeBlock.shifts.reduce(
        (eventTimeBlockTotal, shift) =>
          eventTimeBlockTotal +
          shift.assignments.filter(isActiveAssignment).length,
        0,
      )
    );
  }, 0);
}

function mapCycleBuilderData(
  data: Awaited<ReturnType<typeof adminApi.getCycleBuilderData>>,
): CycleBuilderData {
  const volunteerNames = new Map<string, string>();
  const volunteerMemberships = new Map<string, AssigneeMembership>();
  for (const item of data.events) {
    for (const eventTimeBlockItem of item.eventTimeBlocks) {
      for (const shiftItem of eventTimeBlockItem.shifts) {
        for (const volunteer of shiftItem.eligibleVolunteers) {
          volunteerNames.set(volunteer.volunteerId, volunteer.volunteerName);
          volunteerMemberships.set(volunteer.volunteerId, {
            ministryAccessLevel: volunteer.ministryAccessLevel,
          });
        }
      }
    }
  }

  const assignments = data.events.flatMap((item) =>
    item.eventTimeBlocks.flatMap((eventTimeBlockItem) =>
      eventTimeBlockItem.shifts.flatMap((shiftItem) =>
        shiftItem.assignments.map((assignment) => ({
          ...assignment,
          volunteerName: volunteerNames.get(assignment.volunteerId),
          membership: volunteerMemberships.get(assignment.volunteerId),
        })),
      ),
    ),
  );
  const events = data.events.map((item) => {
    const eventTimeBlocks = item.eventTimeBlocks.map((eventTimeBlockItem) => {
      const { cancelled } = eventTimeBlockItem;
      const shifts = eventTimeBlockItem.shifts.map((shiftItem) => {
        const peopleNeeded = shiftItem.requirements.reduce(
          (total, requirement) => total + requirement.peopleNeeded,
          0,
        );
        const assignedCount =
          shiftItem.assignments.filter(isActiveAssignment).length;

        return {
          shiftId: shiftItem.shift.id,
          eventTimeBlockId: eventTimeBlockItem.eventTimeBlock.id,
          label: shiftItem.shift.label,
          startTime: shiftItem.shift.startTime,
          endTime: shiftItem.shift.endTime,
          cancelled,
          peopleNeeded,
          assignedCount,
          requirements: shiftItem.requirements,
          assignments: shiftItem.assignments.map((assignment) => ({
            ...assignment,
            volunteerName: volunteerNames.get(assignment.volunteerId),
            membership: volunteerMemberships.get(assignment.volunteerId),
          })),
          eligibleVolunteerCount: shiftItem.eligibleVolunteers.length,
          eligibleVolunteers: shiftItem.eligibleVolunteers,
        };
      });

      const peopleNeeded = shifts.reduce(
        (total, shift) => total + shift.peopleNeeded,
        0,
      );
      const assignedCount = shifts.reduce(
        (total, shift) => total + shift.assignedCount,
        0,
      );

      return {
        eventTimeBlockId: eventTimeBlockItem.eventTimeBlock.id,
        label: eventTimeBlockItem.eventTimeBlock.label,
        startTime: eventTimeBlockItem.eventTimeBlock.startTime,
        endTime: eventTimeBlockItem.eventTimeBlock.endTime,
        included: eventTimeBlockItem.included,
        cancelled,
        peopleNeeded,
        assignedCount,
        shiftCount: shifts.length,
        shifts,
      };
    });

    const peopleNeeded = sumPeopleNeeded(eventTimeBlocks);
    const assignedCount = sumAssignedCount(eventTimeBlocks);
    const coveredPlaces = eventTimeBlocks
      .filter(isStaffedEventTimeBlock)
      .reduce(
        (covered, block) =>
          covered +
          block.shifts.reduce(
            (total, shift) => total + countCoveredPlaces(shift),
            0,
          ),
        0,
      );

    return {
      participationId: item.participation.id,
      state: item.participation.state,
      eventId: item.event.id,
      title: item.event.title,
      start: item.event.start,
      end: item.event.end,
      status: item.event.status,
      fillRatio: peopleNeeded === 0 ? 0 : coveredPlaces / peopleNeeded,
      peopleNeeded,
      assignedCount,
      eventTimeBlockCount: eventTimeBlocks.filter(isStaffedEventTimeBlock)
        .length,
      eventTimeBlocks,
    };
  });

  return {
    events,
    assignments,
    roles: data.roles,
    affectedVolunteerCount: data.affectedVolunteerCount,
  };
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
      // `published` is false when the cycle is below its staffing target and
      // the leader has not confirmed: the builder then asks them to, from this
      // result, so only a real publish is announced here.
      if (result.published) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] }),
          queryClient.invalidateQueries({
            queryKey: ['prepare-cycle-participation', ministryId, cycleId],
          }),
        ]);
        toast.success(m.builder_logic_cycle_published());
      }
    },
    onError: (error) => {
      toast.error(
        builderErrorMessage({ error, fallback: m.common_publish_failed() }),
      );
    },
  });

  const sendUpdates = useMutation({
    mutationFn: () => adminApi.sendScheduleUpdates(cycleId, { ministryId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...CYCLE_BUILDER_QUERY_KEY, cycleId, ministryId],
        }),
        queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] }),
        queryClient.invalidateQueries({
          queryKey: ['prepare-cycle-participation', ministryId, cycleId],
        }),
      ]);
      toast.success(m.schedule_updates_sent());
    },
    onError: (error) =>
      toast.error(
        builderErrorMessage({ error, fallback: m.schedule_updates_failed() }),
      ),
  });

  const queryKey = [...CYCLE_BUILDER_QUERY_KEY, cycleId, ministryId];

  // Fire-and-forget on purpose: the cache already holds the optimistic result,
  // so awaiting the refetch would only keep `mutateAsync` — and the toast that
  // follows it — pending for a second round trip.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] });
    // A cover closes the Assignment's request: the ⚠ and sheet read from this list.
    void queryClient.invalidateQueries({
      queryKey: ['ministry-swap-requests'],
    });
  };

  const applyOptimistic = async ({
    update,
  }: ApplyOptimisticInput): Promise<CycleBuilderOptimisticContext> => {
    // An in-flight refetch would land after this write and undo it.
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<CycleBuilderQueryData>(queryKey);
    if (previous) {
      queryClient.setQueryData<CycleBuilderQueryData>(
        queryKey,
        update({ data: previous }),
      );
    }
    return { previous };
  };

  const rollbackOptimistic = ({ context }: RollbackOptimisticInput): void => {
    if (!context?.previous) return;
    queryClient.setQueryData<CycleBuilderQueryData>(queryKey, context.previous);
  };

  const createAssignment = useMutation({
    mutationFn: ({ shiftId, body }: CreateCycleAssignmentParams) =>
      adminApi.createParticipationAssignment(shiftId, body),
    onMutate: ({ shiftId, body }) =>
      applyOptimistic({
        update: ({ data }) =>
          addOptimisticAssignment({
            data,
            assignmentId: createOptimisticAssignmentId(),
            shiftId,
            body,
            assignedAt: now(),
          }),
      }),
    onError: (_error, _variables, context) => rollbackOptimistic({ context }),
    onSettled: invalidate,
  });

  const deleteAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      adminApi.deleteParticipationAssignment(assignmentId),
    onMutate: (assignmentId) =>
      applyOptimistic({
        update: ({ data }) =>
          removeOptimisticAssignment({ data, assignmentId }),
      }),
    onError: (_error, _variables, context) => rollbackOptimistic({ context }),
    onSettled: invalidate,
  });

  const reassignAssignment = useMutation({
    mutationFn: ({ assignmentId, body }: ReassignCycleAssignmentParams) =>
      adminApi.reassignParticipationAssignment(assignmentId, body),
    onMutate: ({ assignmentId, body }) =>
      applyOptimistic({
        update: ({ data }) =>
          replaceOptimisticAssignmentVolunteer({
            data,
            assignmentId,
            volunteerId: body.volunteerId,
          }),
      }),
    onError: (_error, _variables, context) => rollbackOptimistic({ context }),
    onSettled: invalidate,
  });

  const moveAssignment = useMutation({
    mutationFn: ({ assignmentId, body }: MoveCycleAssignmentParams) =>
      adminApi.moveParticipationAssignment(assignmentId, body),
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
    sendUpdates,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
    moveAssignment,
  };
}
