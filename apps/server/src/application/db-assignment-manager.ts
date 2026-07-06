import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  AssignmentId,
  ChurchId,
  UserId,
  VolunteerId,
} from '../domain/branded-ids';
import { HardConstraintError } from '../domain/conflict/errors/hard-constraint-error';
import type {
  CreateAssignmentInput,
  CreateParticipationAssignmentInput,
  CreateParticipationAssignmentResult,
  DeleteAssignmentInput,
  GetAssignmentInput,
  IAssignmentManager,
  ListAssignmentAuditLogInput,
  OverrideAssignmentInput,
  ReassignParticipationAssignmentInput,
} from '../domain/contracts/application/assignment-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { AssignmentAudit } from '../domain/entities/assignment-audit';

interface ReassignTransactionResult {
  nextAssignment: Assignment;
  previousVolunteerId: VolunteerId;
}

@injectable()
export class DbAssignmentManager implements IAssignmentManager {
  constructor(
    @inject('IAssignmentRepository')
    private readonly assignmentRepo: AssignmentRepository,
    @inject('IAssignmentAuditRepository')
    private readonly auditRepo: AssignmentAuditRepository,
    @inject('IShiftRepository')
    private readonly shiftRepository: ShiftRepository,
    @inject('IMinistryParticipationRepository')
    private readonly participationRepository: MinistryParticipationRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepository: MinistryRepository,
    @inject('IVolunteerRepository')
    private readonly volunteerRepository: VolunteerRepository,
    @inject('IAvailabilityRepository')
    private readonly availabilityRepository: AvailabilityRepository,
    @inject('IPlanningEventRepository')
    private readonly planningEventRepository: PlanningEventRepository,
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
    const { churchId, slotId, volunteerId, roleId, actorId, reason } = input;
    const assignment = await this.assignmentRepo.create(churchId, {
      slotId,
      volunteerId,
      roleId,
      status: 'pending',
      reason,
      assignedBy: actorId,
    });
    await this.auditRepo.create(churchId, {
      assignmentId: assignment.id,
      actorId: actorId as UserId,
      action: 'created',
      reason,
    });
    return assignment;
  }

  async getAssignment(input: GetAssignmentInput): Promise<Assignment> {
    return this.assignmentRepo.getById(input.churchId, input.assignmentId);
  }

  async createParticipationAssignment(
    input: CreateParticipationAssignmentInput,
  ): Promise<CreateParticipationAssignmentResult> {
    return this.unitOfWork.run((tx) =>
      this.createParticipationAssignmentInTransaction(input, tx),
    );
  }

  async deleteAssignment(input: DeleteAssignmentInput): Promise<void> {
    const { assignmentId, churchId, actorId } = input;
    await this.unitOfWork.run(async (tx) => {
      await this.auditRepo.create(
        churchId,
        {
          assignmentId,
          actorId,
          action: 'deleted',
        },
        tx,
      );
      await this.assignmentRepo.deleteById(churchId, assignmentId, tx);
    });
  }

  async overrideAssignment(input: OverrideAssignmentInput): Promise<void> {
    await this.assignmentRepo.getById(input.churchId, input.assignmentId);
    await this.auditRepo.create(input.churchId, {
      assignmentId: input.assignmentId,
      actorId: input.actorId,
      action: 'updated',
      reason: input.reason,
    });
  }

  async reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment> {
    const { nextAssignment, previousVolunteerId } = await this.unitOfWork.run(
      async (tx): Promise<ReassignTransactionResult> => {
        const currentAssignment = await this.assignmentRepo.getById(
          input.churchId,
          input.assignmentId,
          tx,
        );
        if (!currentAssignment.shiftId) {
          throw new Error('Assignment is missing a shift reference');
        }
        const nextAssignmentResult =
          await this.createParticipationAssignmentInTransaction(
            {
              churchId: input.churchId,
              shiftId: currentAssignment.shiftId,
              volunteerId: input.volunteerId,
              roleId: currentAssignment.roleId,
              actorId: input.actorId,
              override: { reason: input.reason },
            },
            tx,
          );
        if (!nextAssignmentResult.assignment.participationId) {
          throw new Error('Assignment is missing a participation reference');
        }

        await this.assignmentRepo.deleteById(
          input.churchId,
          currentAssignment.id,
          tx,
        );
        await this.auditRepo.create(
          input.churchId,
          {
            assignmentId: nextAssignmentResult.assignment.id,
            actorId: input.actorId,
            action: 'updated',
            reason: input.reason,
          },
          tx,
        );

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

  async listAuditLog(
    input: ListAssignmentAuditLogInput,
  ): Promise<AssignmentAudit[]> {
    return this.auditRepo.listByAssignment(input.churchId, input.assignmentId);
  }

  private async createParticipationAssignmentInTransaction(
    input: CreateParticipationAssignmentInput,
    tx: import('../domain/contracts/infrastructure/transaction-context').TransactionContext,
  ): Promise<CreateParticipationAssignmentResult> {
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
    const ministry = await this.ministryRepository.getById(
      input.churchId,
      participation.ministryId,
      tx,
    );

    const [hasMembership, hasQualification, existingShiftAssignments] =
      await Promise.all([
        this.volunteerRepository.hasMembershipInMinistry(
          input.churchId,
          input.volunteerId,
          participation.ministryId,
          tx,
        ),
        this.volunteerRepository.hasRoleQualification(
          input.churchId,
          input.volunteerId,
          input.roleId,
          tx,
        ),
        this.assignmentRepo.listByShift(input.churchId, shift.id, tx),
      ]);

    if (!hasMembership) {
      throw new HardConstraintError(
        'NOT_IN_MINISTRY',
        'Volunteer does not belong to the requested ministry',
      );
    }

    if (!hasQualification) {
      throw new HardConstraintError(
        'NOT_QUALIFIED',
        'Volunteer is not qualified for the requested role',
      );
    }

    if (
      existingShiftAssignments.some(
        (assignment) =>
          assignment.volunteerId === input.volunteerId &&
          isActiveAssignmentStatus(assignment.status),
      )
    ) {
      throw new HardConstraintError(
        'DUPLICATE_ASSIGNMENT',
        'Volunteer is already assigned to this shift',
      );
    }

    const [availabilityMarks, overlappingAssignments] = await Promise.all([
      this.availabilityRepository.listByVolunteers(
        input.churchId,
        [input.volunteerId],
        tx,
      ),
      this.assignmentRepo.listByVolunteerInRange(
        input.churchId,
        input.volunteerId,
        shift.startTime,
        shift.endTime,
        tx,
      ),
    ]);

    const warnings = [];
    if (
      availabilityMarks.some(
        (mark) => (mark.shiftId as string) === (shift.id as string),
      )
    ) {
      warnings.push({
        type: 'UNAVAILABLE' as const,
        details: 'Volunteer is marked unavailable for this shift',
      });
    }

    const hasOverlapConflict = overlappingAssignments.some(
      (assignment) =>
        assignment.shiftId !== shift.id &&
        isActiveAssignmentStatus(assignment.status),
    );
    if (hasOverlapConflict) {
      warnings.push({
        type: 'DOUBLE_BOOKED' as const,
        details: 'Volunteer is already assigned to another overlapping shift',
        conflictingId: overlappingAssignments[0]?.id as string,
      });
    }

    if (
      ministry.enforcementType === 'hard' &&
      hasOverlapConflict &&
      !input.override?.reason
    ) {
      throw new HardConstraintError(
        'DUPLICATE_ASSIGNMENT',
        'Volunteer is already assigned to another overlapping shift',
      );
    }

    const assignment = await this.assignmentRepo.create(
      input.churchId,
      {
        slotId: shift.timeSlotId,
        participationId: participation.id,
        shiftId: shift.id,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        status: 'pending',
        reason: input.override?.reason,
        assignedBy: input.actorId,
      },
      tx,
    );

    if (participation.state === 'availability_fired') {
      participation.startRostering();
      await this.participationRepository.updateState({
        churchId: input.churchId,
        participationId: participation.id,
        state: participation.state,
        tx,
      });
    }

    await this.auditRepo.create(
      input.churchId,
      {
        assignmentId: assignment.id,
        actorId: input.actorId,
        action: 'created',
        reason: input.override?.reason,
      },
      tx,
    );

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
  }: {
    churchId: ChurchId;
    previousVolunteerId: VolunteerId;
    nextVolunteerId: VolunteerId;
    participationId: NonNullable<Assignment['participationId']>;
    assignmentId: AssignmentId;
  }): Promise<void> {
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
      planningCycleId: event.planningCycleId,
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
      planningCycleId: event.planningCycleId,
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
