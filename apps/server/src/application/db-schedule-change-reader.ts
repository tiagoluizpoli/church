import { NotFoundError } from '@church/core';
import { now } from '@church/time';
import type {
  CycleId,
  MinistryId,
  MinistryParticipationId,
  VolunteerId,
} from '../domain/branded-ids';
import type {
  CollectAssignmentSnapshotsInput,
  CollectScheduleAssignmentsInput,
  CompareLiveScheduleAssignmentsInput,
  CompareScheduleAssignmentsInput,
  CountScheduleChangesBySchedulesInput,
  CountScheduleChangesInput,
  DbScheduleChangeReaderDependencies,
  IScheduleChangeReader,
  ParticipationAssignmentSnapshot,
  ParticipationStaffingView,
  ReadParticipationCompletionInput,
  ScheduleChangeCount,
  ScheduleComparison,
  ScheduledParticipation,
  ScheduleVolunteerChanges,
  ToAssignmentSnapshotInput,
} from '../domain/contracts/application/schedule-change-reader';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import { isActiveAssignmentStatus } from '../domain/entities/assignment';
import { calculateCompletionPercent } from '../domain/entities/ministry-participation';
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
        const own = byVolunteer.get(assignment.volunteerId) ?? [];
        own.push(
          toAssignmentSnapshot({ assignment, event, shift, requirement, role }),
        );
        byVolunteer.set(assignment.volunteerId, own);
      }
    }
    return byVolunteer;
  }

  async countScheduleChanges(
    input: CountScheduleChangesInput,
  ): Promise<number> {
    const [schedule] = await this.countScheduleChangesBySchedules({
      churchId: input.churchId,
      schedules: [{ ministryId: input.ministryId, cycleId: input.cycleId }],
      tx: input.tx,
    });
    return schedule?.count ?? 0;
  }

  async countScheduleChangesBySchedules({
    churchId,
    schedules,
    tx,
  }: CountScheduleChangesBySchedulesInput): Promise<ScheduleChangeCount[]> {
    const published =
      await this.participationRepository.listPublishedScheduleParticipations({
        churchId,
        schedules,
        tx,
      });
    if (published.length === 0) return [];
    const comparisons: ScheduleComparison[] = [];
    const byMinistry = new Map<MinistryId, Map<CycleId, ScheduleComparison>>();
    const byParticipation = new Map<
      MinistryParticipationId,
      ScheduleComparison
    >();
    for (const { participation, event } of published) {
      const { ministryId } = participation;
      const { cycleId } = event;
      const byCycle =
        byMinistry.get(ministryId) ?? new Map<CycleId, ScheduleComparison>();
      byMinistry.set(ministryId, byCycle);
      let comparison = byCycle.get(cycleId);
      if (!comparison) {
        const schedule = { ministryId, cycleId };
        comparison = { schedule, baseline: [], current: new Map() };
        byCycle.set(cycleId, comparison);
        comparisons.push(comparison);
      }
      byParticipation.set(participation.id, comparison);
    }
    const toldSchedules = comparisons.map(({ schedule }) => schedule);
    const cycleIds = [...new Set(toldSchedules.map(({ cycleId }) => cycleId))];
    const [snapshots, lastTold, cancellations] = await Promise.all([
      this.collectAssignmentSnapshots({
        churchId,
        participations: published.map(({ participation }) => participation),
        events: published.map(({ event }) => event),
        tx,
      }),
      this.participationRepository.listScheduleLastToldBySchedules({
        churchId,
        schedules: toldSchedules,
        tx,
      }),
      this.eventRepository.listCycleCancellations({
        churchId,
        cycleIds,
        tx,
      }),
    ]);
    for (const { participationId, volunteerId, snapshot } of snapshots) {
      const comparison = byParticipation.get(participationId);
      if (!comparison) throw new NotFoundError('Schedule not found');
      const own = comparison.current.get(volunteerId) ?? [];
      comparison.current.set(volunteerId, [...own, snapshot]);
    }
    for (const row of lastTold) {
      const { ministryId, cycleId } = row;
      byMinistry.get(ministryId)?.get(cycleId)?.baseline.push(row);
    }
    const cancelledByCycle = new Map(
      cancellations.map((cancelled) => [cancelled.cycleId, cancelled]),
    );
    const at = now();
    return comparisons.map(({ schedule, baseline, current }) => {
      const cancelled = cancelledByCycle.get(schedule.cycleId);
      return {
        ...schedule,
        count: this.compareLiveScheduleAssignments({
          cancelledEventIds: new Set(cancelled?.eventIds ?? []),
          cancelledShiftIds: new Set(cancelled?.shiftIds ?? []),
          baseline,
          current,
          at,
        }).length,
      };
    });
  }

  async readParticipationCompletion({
    churchId,
    participationId,
    tx,
  }: ReadParticipationCompletionInput): Promise<ParticipationStaffingView> {
    const [requirements, assignments] = await Promise.all([
      this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId,
        requirements: 'live',
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
      gapCount: peopleNeeded - coveredPlaces,
      completionPercent: calculateCompletionPercent({
        assignedCount: coveredPlaces,
        peopleNeeded,
      }),
    };
  }

  // SQL twin: `listCycleCancellations` (drizzle-planning-event.repository.ts).
  compareScheduleAssignments({
    events,
    baseline,
    current,
    at,
  }: CompareScheduleAssignmentsInput): ScheduleVolunteerChanges[] {
    const cancelledEventIds = new Set(
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
        .flatMap(({ shiftId }) => (shiftId ? [shiftId] : [])),
    );
    return this.compareLiveScheduleAssignments({
      cancelledEventIds,
      cancelledShiftIds,
      baseline,
      current,
      at,
    });
  }

  private compareLiveScheduleAssignments({
    cancelledEventIds,
    cancelledShiftIds,
    baseline,
    current,
    at,
  }: CompareLiveScheduleAssignmentsInput): ScheduleVolunteerChanges[] {
    const live = (items: ScheduleAssignmentSnapshot[]) =>
      items.filter(
        ({ eventId, shiftId }) =>
          !cancelledEventIds.has(eventId) && !cancelledShiftIds.has(shiftId),
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

  /**
   * Snapshots of the participations' active Assignments in a fixed number of
   * reads: participation order, then earliest Shift first.
   */
  private async collectAssignmentSnapshots({
    churchId,
    participations,
    events,
    tx,
  }: CollectAssignmentSnapshotsInput): Promise<
    ParticipationAssignmentSnapshot[]
  > {
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const scheduled = new Map<
      MinistryParticipationId | undefined,
      ScheduledParticipation
    >(
      participations.map((participation) => {
        const event = eventsById.get(participation.eventId);
        if (!event) throw new NotFoundError('Schedule Event not found');
        return [participation.id, { participation, event }];
      }),
    );
    const assignments = await this.assignmentRepository.listByParticipations({
      churchId,
      participationIds: participations.map(({ id }) => id),
      assignments: 'active',
      tx,
    });
    if (assignments.length === 0) return [];
    const shiftIds = [
      ...new Set(
        assignments.flatMap(({ shiftId }) => (shiftId ? [shiftId] : [])),
      ),
    ];
    const shiftRequirementIds = [
      ...new Set(
        assignments.flatMap(({ shiftRequirementId }) =>
          shiftRequirementId ? [shiftRequirementId] : [],
        ),
      ),
    ];
    const roleIds = [...new Set(assignments.map(({ roleId }) => roleId))];
    const [shifts, requirements, roles] = await Promise.all([
      this.shiftRepository.listByIds({
        churchId,
        shiftIds,
        tx,
      }),
      this.shiftRepository.listRequirementsByIds({
        churchId,
        shiftRequirementIds,
        tx,
      }),
      this.roleRepository.listByIds({
        churchId,
        roleIds,
        tx,
      }),
    ]);
    const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
    const requirementsById = new Map(
      requirements.map((requirement) => [requirement.id, requirement]),
    );
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    return assignments.map((assignment) => {
      const found = scheduled.get(assignment.participationId);
      if (!found) throw new NotFoundError('Schedule Event not found');
      const { participation, event } = found;
      const role = rolesById.get(assignment.roleId);
      if (!role) throw new NotFoundError('Assignment Role not found');
      return {
        participationId: participation.id,
        volunteerId: assignment.volunteerId,
        snapshot: toAssignmentSnapshot({
          assignment,
          event,
          shift: assignment.shiftId && shiftsById.get(assignment.shiftId),
          requirement:
            assignment.shiftRequirementId &&
            requirementsById.get(assignment.shiftRequirementId),
          role,
        }),
      };
    });
  }
}

function toAssignmentSnapshot({
  assignment,
  event,
  shift,
  requirement,
  role,
}: ToAssignmentSnapshotInput): ScheduleAssignmentSnapshot {
  if (!shift || !requirement)
    throw new NotFoundError('Assignment Shift or requirement not found');
  return {
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
}
