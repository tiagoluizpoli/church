import { compareInstants, fromDate, type Instant } from '@church/time';
import type { VolunteerId } from '../domain/branded-ids';
import type { IParticipationReader } from '../domain/contracts/application/participation-reader';
import type {
  BuildBuilderEventViewInput,
  BuildEligibleForVolunteerInput,
  BuildEligibleVolunteerViewInput,
  CycleBuilderEventTimeBlockView,
  CycleBuilderEventView,
  CycleBuilderRequirementView,
  CycleBuilderRoleOption,
  CycleBuilderShiftView,
  CycleBuilderView,
  DbScheduleBuilderReaderDependencies,
  EligibleVolunteerView,
  GetCycleBuilderDataInput,
  IScheduleBuilderReader,
  ListEligibleForShiftsInput,
  ListEligibleVolunteersInput,
  ListQualifiedVolunteersForShiftInput,
  QualifiedVolunteerRef,
  RangesOverlapInput,
  SortEligibleVolunteersInput,
} from '../domain/contracts/application/schedule-builder-reader';
import type { IScheduleChangeReader } from '../domain/contracts/application/schedule-change-reader';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { Shift } from '../domain/entities/shift';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import { isEventTimeBlockCancelled } from '../domain/event-time-block-cancellation';

function dedupeVolunteersById(
  volunteers: QualifiedVolunteerRef[],
): QualifiedVolunteerRef[] {
  const byId = new Map<string, QualifiedVolunteerRef>();
  for (const volunteer of volunteers) {
    byId.set(volunteer.id as string, volunteer);
  }
  return [...byId.values()];
}

function buildBuilderEventView({
  eventGroup,
  participation,
  includedEventTimeBlockIds,
  shifts,
  requirements,
  assignments,
  marks,
  eligibleByShift,
}: BuildBuilderEventViewInput): CycleBuilderEventView {
  const shiftsByEventTimeBlock = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const eventTimeBlockShifts =
      shiftsByEventTimeBlock.get(shift.eventTimeBlockId as string) ?? [];
    eventTimeBlockShifts.push(shift);
    shiftsByEventTimeBlock.set(
      shift.eventTimeBlockId as string,
      eventTimeBlockShifts,
    );
  }

  const requirementsByShift = new Map<string, CycleBuilderRequirementView[]>();
  for (const requirement of requirements) {
    const key = (requirement.shiftId ?? '') as string;
    const shiftRequirements = requirementsByShift.get(key) ?? [];
    shiftRequirements.push({
      requirement,
    });
    requirementsByShift.set(key, shiftRequirements);
  }

  const assignmentsByShift = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    if (assignment.shiftId == null) {
      continue;
    }
    const key = assignment.shiftId as string;
    const shiftAssignments = assignmentsByShift.get(key) ?? [];
    shiftAssignments.push(assignment);
    assignmentsByShift.set(key, shiftAssignments);
  }

  const eventTimeBlocks: CycleBuilderEventTimeBlockView[] =
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => {
      const eventTimeBlockShifts =
        shiftsByEventTimeBlock.get(eventTimeBlock.id as string) ?? [];
      const shiftViews: CycleBuilderShiftView[] = eventTimeBlockShifts.map(
        (shift) => ({
          shift,
          requirements: requirementsByShift.get(shift.id as string) ?? [],
          assignments: (assignmentsByShift.get(shift.id as string) ?? []).map(
            (assignment) => ({
              assignment,
              lateMark: marks.some(
                (mark) =>
                  mark.shiftId === shift.id &&
                  mark.volunteerId === assignment.volunteerId &&
                  compareInstants({
                    left: fromDate({ date: mark.createdAt }),
                    right: assignment.assignedAt,
                  }) > 0,
              ),
            }),
          ),
          eligibleVolunteers: eligibleByShift.get(shift.id as string) ?? [],
        }),
      );

      return {
        eventTimeBlock,
        included: includedEventTimeBlockIds.has(eventTimeBlock.id as string),
        cancelled: isEventTimeBlockCancelled({
          event: eventGroup.event,
          eventTimeBlock,
        }),
        shifts: shiftViews,
      };
    });

  return {
    participation,
    event: eventGroup.event,
    eventTimeBlocks,
  };
}

function buildEligibleForVolunteer({
  volunteer,
  shift,
  activeAssignments,
  fairnessAssignments,
  assignmentShiftsById,
  unavailableShiftKeys,
  membershipInfoByVolunteerId,
  checkStates,
  conflictDetails,
}: BuildEligibleForVolunteerInput): EligibleVolunteerView {
  const volunteerAssignments = activeAssignments.filter(
    (assignment) => assignment.volunteerId === volunteer.id,
  );
  const overlapping = volunteerAssignments.find((assignment) => {
    const other = assignmentShiftsById.get(assignment.shiftId as string);
    return (
      assignment.shiftId !== shift.id &&
      other &&
      rangesOverlap({
        startTime: shift.startTime,
        endTime: shift.endTime,
        otherStartTime: other.startTime,
        otherEndTime: other.endTime,
      })
    );
  });
  const details =
    overlapping && conflictDetails.get(overlapping.shiftId as string);
  const conflict =
    overlapping && details
      ? { assignmentId: overlapping.id as string, ...details }
      : null;
  const isUnavailable = unavailableShiftKeys.has(
    `${volunteer.id as string}:${shift.id as string}`,
  );
  const checkState = checkStates.get(volunteer.id as string);
  const answerState =
    checkState === 'pending'
      ? 'unanswered'
      : !checkState
        ? 'not_asked'
        : isUnavailable
          ? 'unavailable'
          : 'available';
  const lastServedAt = fairnessAssignments
    .filter((assignment) => assignment.volunteerId === volunteer.id)
    .map(
      (assignment) =>
        assignmentShiftsById.get(assignment.shiftId as string)?.startTime,
    )
    .filter(
      (servedAt): servedAt is Instant =>
        servedAt !== undefined &&
        compareInstants({ left: servedAt, right: shift.startTime }) < 0,
    )
    .sort((left, right) => compareInstants({ left: right, right: left }))[0];

  const membershipInfo = membershipInfoByVolunteerId.get(
    volunteer.id as string,
  );

  return buildEligibleVolunteerView({
    volunteerId: volunteer.id as string,
    volunteerName: volunteer.name ?? 'Unknown volunteer',
    answerState,
    conflict,
    lastServedAt,
    qualifiedRoleIds: membershipInfo?.qualifiedRoleIds ?? [],
    ministryAccessLevel: membershipInfo?.ministryAccessLevel ?? 'volunteer',
  });
}

function sortEligibleVolunteers({
  eligible,
  assignments,
}: SortEligibleVolunteersInput): EligibleVolunteerView[] {
  const workload = new Map<string, number>();
  for (const assignment of assignments) {
    const id = assignment.volunteerId as string;
    workload.set(id, (workload.get(id) ?? 0) + 1);
  }
  return [...eligible].sort((left, right) => {
    const order = ['available', 'unanswered', 'not_asked', 'unavailable'];
    if (left.answerState !== right.answerState)
      return order.indexOf(left.answerState) - order.indexOf(right.answerState);

    if (left.lastServedAt !== right.lastServedAt) {
      if (!left.lastServedAt) return -1;
      if (!right.lastServedAt) return 1;
      const comparison = compareInstants({
        left: left.lastServedAt,
        right: right.lastServedAt,
      });
      if (comparison !== 0) return comparison;
    }

    const workloadDifference =
      (workload.get(left.volunteerId as string) ?? 0) -
      (workload.get(right.volunteerId as string) ?? 0);
    return (
      workloadDifference ||
      left.volunteerName.localeCompare(right.volunteerName)
    );
  });
}

function rangesOverlap({
  startTime,
  endTime,
  otherStartTime,
  otherEndTime,
}: RangesOverlapInput): boolean {
  return (
    compareInstants({ left: startTime, right: otherEndTime }) < 0 &&
    compareInstants({ left: endTime, right: otherStartTime }) > 0
  );
}

function buildEligibleVolunteerView({
  volunteerId,
  volunteerName,
  answerState,
  conflict,
  lastServedAt,
  qualifiedRoleIds,
  ministryAccessLevel,
}: BuildEligibleVolunteerViewInput): EligibleVolunteerView {
  return {
    volunteerId: volunteerId as EligibleVolunteerView['volunteerId'],
    volunteerName,
    answerState,
    conflict,
    lastServedAt,
    qualifiedRoleIds,
    ministryAccessLevel,
  };
}

export class DbScheduleBuilderReader implements IScheduleBuilderReader {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly roleRepository: RoleRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly participationReader: IParticipationReader;
  private readonly scheduleChangeReader: IScheduleChangeReader;

  constructor({
    assignmentRepository,
    cycleRepository,
    eventRepository,
    ministryRepository,
    participationRepository,
    roleRepository,
    shiftRepository,
    unavailableShiftRepository,
    unitOfWork,
    volunteerRepository,
    participationReader,
    scheduleChangeReader,
  }: DbScheduleBuilderReaderDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.ministryRepository = ministryRepository;
    this.participationRepository = participationRepository;
    this.roleRepository = roleRepository;
    this.shiftRepository = shiftRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.unitOfWork = unitOfWork;
    this.volunteerRepository = volunteerRepository;
    this.participationReader = participationReader;
    this.scheduleChangeReader = scheduleChangeReader;
  }

  async getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    const cycle = await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    return this.unitOfWork.run(async (tx) => {
      const affectedVolunteerCount =
        await this.scheduleChangeReader.countScheduleChanges({
          ...input,
          tx,
        });
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const roles = await this.roleRepository.listByMinistry({
        churchId: input.churchId,
        ministryId: input.ministryId,
        tx,
      });
      // One membership read for the whole cycle: every event in it belongs to
      // the same ministry, so hoisting this out of the loop keeps it O(1).
      const membershipInfoByVolunteerId =
        await this.participationReader.listVolunteerMembershipInfo({
          churchId: input.churchId,
          ministryId: input.ministryId,
          tx,
        });

      const checkStates = await this.participationReader.loadCheckStates({
        churchId: input.churchId,
        ministryId: input.ministryId,
        cycleId: input.cycleId,
        tx,
      });
      const candidateFacts = await this.participationReader.loadCandidateFacts({
        churchId: input.churchId,
        volunteerIds: [...membershipInfoByVolunteerId.keys()] as VolunteerId[],
        tx,
      });
      const events: CycleBuilderEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation =
          await this.participationReader.getOrCreateParticipation({
            churchId: input.churchId,
            cycleId: input.cycleId,
            ministryId: input.ministryId,
            eventId: eventGroup.event.id,
            tx,
          });
        const [inclusions, shifts, requirements, assignments, marks] =
          await Promise.all([
            this.participationRepository.listInclusions({
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
            this.assignmentRepository.listByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
            this.unavailableShiftRepository.listByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
          ]);

        // Query B — eligible volunteers batched over all this participation's
        // shifts at once (never N+1). Published participations still include
        // candidates because leaders may reassign after publication.
        const eligibleByShift = await this.listEligibleVolunteersForShifts({
          churchId: input.churchId,
          participation,
          shifts,
          requirements,
          membershipInfoByVolunteerId,
          checkStates,
          candidateFacts,
          tx,
        });

        events.push(
          buildBuilderEventView({
            eventGroup,
            participation,
            includedEventTimeBlockIds: new Set(
              inclusions.map(
                (inclusion) => inclusion.eventTimeBlockId as string,
              ),
            ),
            shifts,
            requirements,
            assignments,
            marks,
            eligibleByShift,
          }),
        );
      }

      const roleOptions: CycleBuilderRoleOption[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
      }));

      return { cycle, events, roles: roleOptions, affectedVolunteerCount };
    });
  }

  async listEligibleVolunteers(
    input: ListEligibleVolunteersInput,
  ): Promise<EligibleVolunteerView[]> {
    return this.unitOfWork.run(async (tx) => {
      const shift = await this.shiftRepository.getById({
        churchId: input.churchId,
        shiftId: input.shiftId,
        tx,
      });
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: shift.participationId,
        tx,
      });
      const requirements =
        await this.shiftRepository.listRequirementsByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        });
      const shiftRequirements = requirements.filter(
        (requirement) => requirement.shiftId === shift.id,
      );
      const qualifiedVolunteers = await this.listQualifiedVolunteersForShift({
        churchId: input.churchId,
        participation,
        requirements: shiftRequirements,
        tx,
      });
      const membershipInfoByVolunteerId =
        await this.participationReader.listVolunteerMembershipInfo({
          churchId: input.churchId,
          ministryId: participation.ministryId,
          tx,
        });
      const event = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: participation.eventId,
        tx,
      });
      const checkStates = await this.participationReader.loadCheckStates({
        churchId: input.churchId,
        ministryId: participation.ministryId,
        cycleId: event.cycleId,
        tx,
      });
      const volunteerIds = qualifiedVolunteers.map((volunteer) => volunteer.id);
      const {
        activeAssignments,
        assignmentShiftsById,
        unavailableShiftKeys,
        conflictDetails,
      } = await this.participationReader.loadCandidateFacts({
        churchId: input.churchId,
        volunteerIds,
        tx,
      });
      const eligible = qualifiedVolunteers.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableShiftKeys,
          membershipInfoByVolunteerId,
          checkStates,
          conflictDetails,
        }),
      );

      return sortEligibleVolunteers({
        eligible,
        assignments: activeAssignments,
      });
    });
  }

  private async listQualifiedVolunteersForShift({
    churchId,
    participation,
    requirements,
    tx,
  }: ListQualifiedVolunteersForShiftInput) {
    const volunteersById = new Map<
      string,
      Awaited<ReturnType<VolunteerRepository['listQualifiedForRole']>>[number]
    >();

    for (const requirement of requirements) {
      const volunteers = await this.volunteerRepository.listQualifiedForRole({
        churchId,
        ministryId: participation.ministryId,
        roleId: requirement.roleId,
        tx,
      });
      for (const volunteer of volunteers) {
        volunteersById.set(volunteer.id as string, volunteer);
      }
    }

    return [...volunteersById.values()];
  }

  private async listEligibleVolunteersForShifts({
    churchId,
    participation,
    shifts,
    requirements,
    membershipInfoByVolunteerId,
    checkStates,
    candidateFacts,
    tx,
  }: ListEligibleForShiftsInput): Promise<
    Map<string, EligibleVolunteerView[]>
  > {
    const eligibleByShift = new Map<string, EligibleVolunteerView[]>();
    if (shifts.length === 0) {
      return eligibleByShift;
    }

    const requirementsByShift = new Map<string, ShiftRequirement[]>();
    for (const requirement of requirements) {
      const key = (requirement.shiftId ?? '') as string;
      const shiftRequirements = requirementsByShift.get(key) ?? [];
      shiftRequirements.push(requirement);
      requirementsByShift.set(key, shiftRequirements);
    }

    // Qualified volunteers per distinct role, fetched once and reused across
    // every shift that requires that role (batched — never per-shift N+1).
    const volunteersByRole = new Map<string, QualifiedVolunteerRef[]>();
    for (const requirement of requirements) {
      const roleKey = requirement.roleId as string;
      if (volunteersByRole.has(roleKey)) {
        continue;
      }
      const volunteers = await this.volunteerRepository.listQualifiedForRole({
        churchId,
        ministryId: participation.ministryId,
        roleId: requirement.roleId,
        tx,
      });
      volunteersByRole.set(roleKey, volunteers);
    }

    const {
      activeAssignments,
      assignmentShiftsById,
      unavailableShiftKeys,
      conflictDetails,
    } = candidateFacts;
    for (const shift of shifts) {
      const shiftRequirements =
        requirementsByShift.get(shift.id as string) ?? [];
      const qualified: QualifiedVolunteerRef[] = dedupeVolunteersById(
        shiftRequirements.flatMap(
          (requirement) =>
            volunteersByRole.get(requirement.roleId as string) ?? [],
        ),
      );
      const eligible = qualified.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableShiftKeys,
          membershipInfoByVolunteerId,
          checkStates,
          conflictDetails,
        }),
      );
      eligibleByShift.set(
        shift.id as string,
        sortEligibleVolunteers({ eligible, assignments: activeAssignments }),
      );
    }

    return eligibleByShift;
  }
}
