import { NotFoundError } from '@church/core';
import { now } from '@church/time';
import type { VolunteerId } from '../domain/branded-ids';
import type {
  CollectScheduleAssignmentsInput,
  CompareScheduleAssignmentsInput,
  CountScheduleChangesInput,
  DbScheduleChangeReaderDependencies,
  IScheduleChangeReader,
  ReadParticipationCompletionInput,
  ScheduleVolunteerChanges,
} from '../domain/contracts/application/schedule-change-reader';
import type { ParticipationCompletionView } from '../domain/contracts/application/schedule-read-model';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import { isActiveAssignmentStatus } from '../domain/entities/assignment';
import {
  calculateCompletionPercent,
  type MinistryParticipation,
} from '../domain/entities/ministry-participation';
import { isEventTimeBlockCancelled } from '../domain/event-time-block-cancellation';
import { scheduleChanges } from '../domain/schedule-changes';
import type { ScheduleAssignmentSnapshot } from '../domain/schedule-last-told';

export class DbScheduleChangeReader implements IScheduleChangeReader {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly roleRepository: RoleRepository;
  private readonly shiftRepository: ShiftRepository;

  constructor({
    assignmentRepository,
    eventRepository,
    participationRepository,
    roleRepository,
    shiftRepository,
  }: DbScheduleChangeReaderDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.eventRepository = eventRepository;
    this.participationRepository = participationRepository;
    this.roleRepository = roleRepository;
    this.shiftRepository = shiftRepository;
  }

  async collectScheduleAssignments({
    input,
    participations,
    events,
    tx,
  }: CollectScheduleAssignmentsInput): Promise<
    Map<VolunteerId, ScheduleAssignmentSnapshot[]>
  > {
    const byVolunteer = new Map<VolunteerId, ScheduleAssignmentSnapshot[]>();
    for (const participation of participations) {
      const event = events.find(
        (group) => group.event.id === participation.eventId,
      )?.event;
      if (!event) throw new NotFoundError('Schedule Event not found');
      const [assignments, shifts, requirements] = await Promise.all([
        this.assignmentRepository.listByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
        this.shiftRepository.listByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
        this.shiftRepository.listRequirementsByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
      ]);
      for (const assignment of assignments.filter((item) =>
        isActiveAssignmentStatus(item.status),
      )) {
        const shift = shifts.find((item) => item.id === assignment.shiftId);
        const requirement = requirements.find(
          (item) => item.id === assignment.shiftRequirementId,
        );
        if (!shift || !requirement)
          throw new NotFoundError('Assignment Shift or requirement not found');
        const role = await this.roleRepository.getById({
          churchId: input.churchId,
          id: assignment.roleId,
          tx,
        });
        const facts: ScheduleAssignmentSnapshot = {
          assignmentId: assignment.id,
          shiftId: shift.id,
          eventId: event.id,
          eventTitle: event.title,
          eventStart: event.start,
          eventEnd: event.end,
          startsAt: shift.startTime,
          endsAt: shift.endTime,
          roleId: role.id,
          roleName: role.name,
          sectorId: requirement.sectorId,
          sectorName: requirement.sectorName,
        };
        const own = byVolunteer.get(assignment.volunteerId) ?? [];
        own.push(facts);
        byVolunteer.set(assignment.volunteerId, own);
      }
    }
    return byVolunteer;
  }

  async countScheduleChanges(
    input: CountScheduleChangesInput,
  ): Promise<number> {
    const { tx } = input;
    {
      const events = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const participations: MinistryParticipation[] = [];
      for (const { event } of events) {
        if (event.status === 'cancelled') continue;
        const participation =
          await this.participationRepository.findByMinistryEvent({
            churchId: input.churchId,
            ministryId: input.ministryId,
            eventId: event.id,
            tx,
          });
        if (participation?.state !== 'published') continue;
        participations.push(participation);
      }
      if (participations.length === 0) return 0;
      const [current, baseline] = await Promise.all([
        this.collectScheduleAssignments({ input, participations, events, tx }),
        this.participationRepository.listScheduleLastTold({ ...input, tx }),
      ]);
      return this.compareScheduleAssignments({
        events,
        baseline,
        current,
        at: now(),
      }).length;
    }
  }

  async readParticipationCompletion({
    churchId,
    participationId,
    tx,
  }: ReadParticipationCompletionInput): Promise<ParticipationCompletionView> {
    const [requirements, assignments] = await Promise.all([
      this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId,
        tx,
      }),
      this.assignmentRepository.listByParticipation({
        churchId,
        participationId,
        tx,
      }),
    ]);
    const peopleNeeded = requirements.reduce(
      (sum, requirement) => sum + requirement.peopleNeeded,
      0,
    );
    const assignedCount = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    ).length;
    const activeByRequirement = new Map<string, number>();
    for (const assignment of assignments) {
      if (
        assignment.shiftRequirementId &&
        isActiveAssignmentStatus(assignment.status)
      ) {
        const requirementId = assignment.shiftRequirementId as string;
        const activeCount = activeByRequirement.get(requirementId) ?? 0;
        activeByRequirement.set(requirementId, activeCount + 1);
      }
    }
    const coveredPlaces = requirements.reduce((sum, requirement) => {
      const activeCount =
        activeByRequirement.get(requirement.id as string) ?? 0;
      const coveredCount = Math.min(activeCount, requirement.peopleNeeded);
      return sum + coveredCount;
    }, 0);

    return {
      participationId,
      peopleNeeded,
      assignedCount,
      completionPercent: calculateCompletionPercent({
        assignedCount: coveredPlaces,
        peopleNeeded,
      }),
    };
  }

  compareScheduleAssignments({
    events,
    baseline,
    current,
    at,
  }: CompareScheduleAssignmentsInput): ScheduleVolunteerChanges[] {
    const cancelled = new Set(
      events
        .filter(({ event }) => event.status === 'cancelled')
        .map(({ event }) => event.id),
    );
    // A cancelled block's Shifts are named by its requirements.
    const cancelledShiftIds = new Set(
      events
        .flatMap(({ event, eventTimeBlocks }) =>
          eventTimeBlocks.filter((eventTimeBlock) =>
            isEventTimeBlockCancelled({ event, eventTimeBlock }),
          ),
        )
        .flatMap(({ requirements }) => requirements)
        .map(({ shiftId }) => shiftId),
    );
    const live = (items: ScheduleAssignmentSnapshot[]) =>
      items.filter(
        ({ eventId, shiftId }) =>
          !cancelled.has(eventId) && !cancelledShiftIds.has(shiftId),
      );
    const old = new Map(
      baseline.map((row) => [row.volunteerId, live(row.assignments)]),
    );
    const ids = new Set([...old.keys(), ...current.keys()]);
    return [...ids]
      .map((id) => {
        const before = old.get(id) ?? [];
        const after = live(current.get(id) ?? []);
        return { id, changes: scheduleChanges({ before, after, at }) };
      })
      .filter(({ changes }) => changes.length > 0);
  }
}
