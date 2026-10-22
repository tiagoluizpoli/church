import { toDate } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  VolunteerId,
} from '../domain/branded-ids';
import { HardConstraintError } from '../domain/conflict/errors/hard-constraint-error';
import type {
  CreateParticipationAssignmentInput,
  CreateParticipationAssignmentResult,
  DeleteAssignmentInput,
  GetAssignmentInput,
  IAssignmentManager,
  ListCycleAuditLogInput,
  ReassignParticipationAssignmentInput,
} from '../domain/contracts/application/assignment-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { AssignmentAudit } from '../domain/entities/assignment-audit';

interface CreateParticipationAssignmentTransactionInput {
  input: CreateParticipationAssignmentInput;
  tx: TransactionContext;
}

interface ReassignTransactionResult {
  nextAssignment: Assignment;
  previousVolunteerId: VolunteerId;
}

interface NotifyReassignmentInput {
  churchId: ChurchId;
  previousVolunteerId: VolunteerId;
  nextVolunteerId: VolunteerId;
  participationId: NonNullable<Assignment['participationId']>;
  assignmentId: AssignmentId;
}

interface DbAssignmentManagerDependencies {
  assignmentRepo: AssignmentRepository;
  auditRepo: AssignmentAuditRepository;
  shiftRepository: ShiftRepository;
  participationRepository: MinistryParticipationRepository;
  volunteerRepository: VolunteerRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  planningEventRepository: PlanningEventRepository;
  cycleRepository: CycleRepository;
  notificationService: NotificationService;
  unitOfWork: UnitOfWork;
}

export class DbAssignmentManager implements IAssignmentManager {
  private readonly assignmentRepo: AssignmentRepository;
  private readonly auditRepo: AssignmentAuditRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly planningEventRepository: PlanningEventRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly notificationService: NotificationService;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    planningEventRepository,
    cycleRepository,
    notificationService,
    unitOfWork,
  }: DbAssignmentManagerDependencies) {
    this.assignmentRepo = assignmentRepo;
    this.auditRepo = auditRepo;
    this.shiftRepository = shiftRepository;
    this.participationRepository = participationRepository;
    this.volunteerRepository = volunteerRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.planningEventRepository = planningEventRepository;
    this.cycleRepository = cycleRepository;
    this.notificationService = notificationService;
    this.unitOfWork = unitOfWork;
  }

  async getAssignment(input: GetAssignmentInput): Promise<Assignment> {
    return this.assignmentRepo.getById({
      churchId: input.churchId,
      assignmentId: input.assignmentId,
    });
  }

  async createParticipationAssignment(
    input: CreateParticipationAssignmentInput,
  ): Promise<CreateParticipationAssignmentResult> {
    return this.unitOfWork.run((tx) =>
      this.createParticipationAssignmentInTransaction({ input, tx }),
    );
  }

  async deleteAssignment(input: DeleteAssignmentInput): Promise<void> {
    const { assignmentId, churchId, actorId } = input;
    await this.unitOfWork.run(async (tx) => {
      await this.auditRepo.create({
        churchId,
        input: {
          assignmentId,
          actorId,
          action: 'deleted',
        },
        tx,
      });
      await this.assignmentRepo.deleteById({ churchId, assignmentId, tx });
    });
  }

  async reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment> {
    const { nextAssignment, previousVolunteerId } = await this.unitOfWork.run(
      async (tx): Promise<ReassignTransactionResult> => {
        const currentAssignment = await this.assignmentRepo.getById({
          churchId: input.churchId,
          assignmentId: input.assignmentId,
          tx,
        });
        if (!currentAssignment.shiftId) {
          throw new Error('Assignment is missing a shift reference');
        }
        const nextAssignmentResult =
          await this.createParticipationAssignmentInTransaction({
            input: {
              churchId: input.churchId,
              shiftId: currentAssignment.shiftId,
              volunteerId: input.volunteerId,
              shiftRequirementId: currentAssignment.shiftRequirementId,
              actorId: input.actorId,
            },
            tx,
          });
        if (!nextAssignmentResult.assignment.participationId) {
          throw new Error('Assignment is missing a participation reference');
        }

        await this.assignmentRepo.deleteById({
          churchId: input.churchId,
          assignmentId: currentAssignment.id,
          tx,
        });
        await this.auditRepo.create({
          churchId: input.churchId,
          input: {
            assignmentId: nextAssignmentResult.assignment.id,
            actorId: input.actorId,
            action: 'updated',
          },
          tx,
        });

        return {
          nextAssignment: nextAssignmentResult.assignment,
          previousVolunteerId: currentAssignment.volunteerId,
        };
      },
    );

    if (!nextAssignment.participationId) {
      throw new Error('Assignment is missing a participation reference');
    }

    // Runs after the transaction commits — the notification service writes
    // on its own connection and can't see the new assignment row otherwise.
    await this.notifyReassignment({
      churchId: input.churchId,
      previousVolunteerId,
      nextVolunteerId: nextAssignment.volunteerId,
      participationId: nextAssignment.participationId,
      assignmentId: nextAssignment.id,
    });

    return nextAssignment;
  }

  async listAuditLogForCycle(
    input: ListCycleAuditLogInput,
  ): Promise<AssignmentAudit[]> {
    await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    return this.auditRepo.listByCycle({
      churchId: input.churchId,
      cycleId: input.cycleId,
      ministryId: input.ministryId,
    });
  }

  private async createParticipationAssignmentInTransaction({
    input,
    tx,
  }: CreateParticipationAssignmentTransactionInput): Promise<CreateParticipationAssignmentResult> {
    const shift = await this.shiftRepository.getById({
      churchId: input.churchId,
      shiftId: input.shiftId,
      tx,
    });
    const requirement = await this.shiftRepository.getRequirementForShift({
      churchId: input.churchId,
      shiftId: shift.id,
      shiftRequirementId: input.shiftRequirementId,
      tx,
    });
    const { roleId } = requirement;
    const participationId =
      requirement.participationId ?? shift.participationId;
    const participation = await this.participationRepository.getById({
      churchId: input.churchId,
      participationId,
      tx,
    });
    const hasMembership =
      await this.volunteerRepository.hasMembershipInMinistry({
        churchId: input.churchId,
        volunteerId: input.volunteerId,
        ministryId: participation.ministryId,
        tx,
      });

    if (!hasMembership) {
      throw new HardConstraintError({
        reason: 'NOT_IN_MINISTRY',
        message: 'Volunteer does not belong to the requested ministry',
      });
    }

    const hasQualification =
      await this.volunteerRepository.hasRoleQualification({
        churchId: input.churchId,
        volunteerId: input.volunteerId,
        ministryId: participation.ministryId,
        roleId,
        tx,
      });
    const existingShiftAssignments = await this.assignmentRepo.listByShift({
      churchId: input.churchId,
      shiftId: shift.id,
      tx,
    });

    const warnings: CreateParticipationAssignmentResult['warnings'] = [];
    if (!hasQualification) {
      warnings.push({
        type: 'NOT_QUALIFIED',
        details: 'Volunteer is not qualified for the requested role',
      });
    }

    if (
      existingShiftAssignments.some(
        (assignment) =>
          assignment.volunteerId === input.volunteerId &&
          isActiveAssignmentStatus(assignment.status),
      )
    ) {
      throw new HardConstraintError({
        reason: 'DUPLICATE_ASSIGNMENT',
        message: 'Volunteer is already assigned to this shift',
      });
    }

    const unavailableShifts =
      await this.unavailableShiftRepository.listByVolunteers({
        churchId: input.churchId,
        volunteerIds: [input.volunteerId],
        tx,
      });
    const overlappingAssignments =
      await this.assignmentRepo.listByVolunteerInRange({
        churchId: input.churchId,
        volunteerId: input.volunteerId,
        startTime: toDate({ instant: shift.startTime }),
        endTime: toDate({ instant: shift.endTime }),
        tx,
      });

    if (
      unavailableShifts.some(
        (unavailableShift) =>
          (unavailableShift.shiftId as string) === (shift.id as string),
      )
    ) {
      warnings.push({
        type: 'UNAVAILABLE' as const,
        details: 'Volunteer is marked unavailable for this shift',
      });
    }

    // Church-wide, so an overlap in any Ministry is refused.
    const hasOverlapConflict = overlappingAssignments.some(
      (assignment) =>
        assignment.shiftId !== shift.id &&
        isActiveAssignmentStatus(assignment.status),
    );
    if (hasOverlapConflict) {
      throw new HardConstraintError({
        reason: 'DUPLICATE_ASSIGNMENT',
        message: 'Volunteer is already assigned to another overlapping shift',
      });
    }

    const assignment = await this.assignmentRepo.create({
      churchId: input.churchId,
      input: {
        eventTimeBlockId: shift.eventTimeBlockId,
        participationId: requirement.participationId ?? participation.id,
        shiftId: requirement.shiftId ?? shift.id,
        volunteerId: input.volunteerId,
        shiftRequirementId: requirement.id,
        status: 'pending',
        assignedBy: input.actorId,
      },
      tx,
    });

    if (participation.state === 'availability_requested') {
      participation.startAssigning();
      await this.participationRepository.updateState({
        churchId: input.churchId,
        participationId: participation.id,
        state: participation.state,
        tx,
      });
    }

    await this.auditRepo.create({
      churchId: input.churchId,
      input: {
        assignmentId: assignment.id,
        actorId: input.actorId,
        action: 'created',
      },
      tx,
    });

    return {
      assignment,
      warnings,
    };
  }

  private async notifyReassignment({
    churchId,
    previousVolunteerId,
    nextVolunteerId,
    participationId,
    assignmentId,
  }: NotifyReassignmentInput): Promise<void> {
    const participation = await this.participationRepository.getById({
      churchId,
      participationId,
    });
    const event = await this.planningEventRepository.getEvent({
      churchId,
      eventId: participation.eventId,
    });

    await this.notificationService.notifyVolunteer({
      churchId: churchId as string,
      volunteerId: previousVolunteerId as string,
      cycleId: event.cycleId,
      ministryId: participation.ministryId,
      eventId: event.id,
      assignmentId,
      type: 'assignment_removed',
      title: 'Assignment changed',
      body: `${event.title} has been reassigned.`,
      payload: {
        assignmentId: assignmentId as string,
        eventId: event.id as string,
        ministryId: participation.ministryId as string,
      },
    });

    await this.notificationService.notifyVolunteer({
      churchId: churchId as string,
      volunteerId: nextVolunteerId as string,
      cycleId: event.cycleId,
      ministryId: participation.ministryId,
      eventId: event.id,
      assignmentId,
      type: 'assignment_added',
      title: 'New assignment',
      body: `You were assigned to ${event.title}.`,
      payload: {
        assignmentId: assignmentId as string,
        eventId: event.id as string,
        ministryId: participation.ministryId as string,
      },
    });
  }
}

function isActiveAssignmentStatus(status: Assignment['status']): boolean {
  return status === 'draft' || status === 'pending' || status === 'confirmed';
}
