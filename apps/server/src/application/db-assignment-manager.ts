import 'reflect-metadata';
import { now, toDate } from '@church/time';
import { inject, injectable } from 'tsyringe';
import { TeamRosterMutationPolicy } from '../domain/authority/team-roster-mutation-policy';
import {
  type AssignmentId,
  type ChurchId,
  type RoleId,
  TeamId,
  type UserId,
  type VolunteerId,
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
  ListCycleAuditLogInput,
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
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { AssignmentAudit } from '../domain/entities/assignment-audit';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
import type { Shift } from '../domain/entities/shift';
import { RosterActionNotAvailableError } from '../domain/errors/roster-action-not-available';

interface ReassignTransactionResult {
  nextAssignment: Assignment;
  previousVolunteerId: VolunteerId;
}

interface AssertTeamLeaderRosterMutationInput {
  churchId: ChurchId;
  teamId: TeamId;
  shift: Shift;
  participation: MinistryParticipation;
  volunteerId: VolunteerId;
  roleId: RoleId;
  tx: TransactionContext;
}

interface NotifyReassignmentInput {
  churchId: ChurchId;
  previousVolunteerId: VolunteerId;
  nextVolunteerId: VolunteerId;
  participationId: NonNullable<Assignment['participationId']>;
  assignmentId: AssignmentId;
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
      if (input.teamLeaderScopeId) {
        const assignment = await this.assignmentRepo.getById(
          churchId,
          assignmentId,
          tx,
        );
        if (!assignment.shiftId) {
          throw new RosterActionNotAvailableError();
        }
        const shift = await this.shiftRepository.getById({
          churchId,
          shiftId: assignment.shiftId,
          tx,
        });
        const participation = await this.participationRepository.getById({
          churchId,
          participationId: shift.participationId,
          tx,
        });
        await this.assertTeamLeaderRosterMutation({
          churchId,
          teamId: input.teamLeaderScopeId,
          shift,
          participation,
          volunteerId: assignment.volunteerId,
          roleId: assignment.roleId,
          tx,
        });
      }

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

  async listAuditLogForCycle(
    input: ListCycleAuditLogInput,
  ): Promise<AssignmentAudit[]> {
    return this.auditRepo.listByCycle({
      churchId: input.churchId,
      cycleId: input.cycleId,
      ministryId: input.ministryId,
    });
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

    if (input.teamLeaderScopeId) {
      if (input.teamId !== input.teamLeaderScopeId) {
        throw new RosterActionNotAvailableError();
      }
      await this.assertTeamLeaderRosterMutation({
        churchId: input.churchId,
        teamId: input.teamLeaderScopeId,
        shift,
        participation,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        tx,
      });
    }

    const hasMembership =
      await this.volunteerRepository.hasMembershipInMinistry(
        input.churchId,
        input.volunteerId,
        participation.ministryId,
        tx,
      );

    if (!hasMembership) {
      throw new HardConstraintError(
        'NOT_IN_MINISTRY',
        'Volunteer does not belong to the requested ministry',
      );
    }

    const hasQualification =
      await this.volunteerRepository.hasRoleQualification(
        input.churchId,
        input.volunteerId,
        participation.ministryId,
        input.roleId,
        tx,
      );
    const existingShiftAssignments = await this.assignmentRepo.listByShift(
      input.churchId,
      shift.id,
      tx,
    );

    const warnings: CreateParticipationAssignmentResult['warnings'] = [];
    if (!hasQualification) {
      warnings.push({
        type: 'NOT_QUALIFIED',
        details: 'Volunteer is not qualified for the requested role',
      });
      if (ministry.enforcementType === 'hard' && !input.override?.reason) {
        throw new HardConstraintError(
          'NOT_QUALIFIED',
          'Volunteer is not qualified for the requested role',
        );
      }
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

    const availabilityMarks =
      await this.availabilityRepository.listByVolunteers(
        input.churchId,
        [input.volunteerId],
        tx,
      );
    const overlappingAssignments =
      await this.assignmentRepo.listByVolunteerInRange(
        input.churchId,
        input.volunteerId,
        toDate({ instant: shift.startTime }),
        toDate({ instant: shift.endTime }),
        tx,
      );

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

  private async assertTeamLeaderRosterMutation({
    churchId,
    teamId,
    shift,
    participation,
    volunteerId,
    roleId,
    tx,
  }: AssertTeamLeaderRosterMutationInput): Promise<void> {
    const [event, requirements, memberships] = await Promise.all([
      this.planningEventRepository.getEvent({
        churchId,
        eventId: participation.eventId,
        tx,
      }),
      this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId: participation.id,
        tx,
      }),
      this.volunteerRepository.listMinistryMemberships(
        churchId,
        participation.ministryId,
        tx,
      ),
    ]);
    const requirementTeamIds = requirements
      .filter(
        (requirement) =>
          requirement.shiftId === shift.id && requirement.roleId === roleId,
      )
      .map((requirement) => requirement.teamId);
    const volunteerTeamIds =
      memberships
        .find((membership) => membership.volunteerId === volunteerId)
        ?.teamMemberships.map((membership) => TeamId.from(membership.teamId)) ??
      [];

    const allowed = TeamRosterMutationPolicy.authorize({
      teamId,
      participationState: participation.state,
      eventStatus: event.status,
      eventStart: event.start,
      now: now(),
      requirementTeamIds,
      volunteerTeamIds,
    });
    if (!allowed) {
      throw new RosterActionNotAvailableError();
    }
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
