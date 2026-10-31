import { toDate } from '@church/time';
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

interface DbAssignmentManagerDependencies {
  assignmentRepo: AssignmentRepository;
  auditRepo: AssignmentAuditRepository;
  shiftRepository: ShiftRepository;
  participationRepository: MinistryParticipationRepository;
  volunteerRepository: VolunteerRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  cycleRepository: CycleRepository;
  unitOfWork: UnitOfWork;
}

export class DbAssignmentManager implements IAssignmentManager {
  private readonly assignmentRepo: AssignmentRepository;
  private readonly auditRepo: AssignmentAuditRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    unitOfWork,
  }: DbAssignmentManagerDependencies) {
    this.assignmentRepo = assignmentRepo;
    this.auditRepo = auditRepo;
    this.shiftRepository = shiftRepository;
    this.participationRepository = participationRepository;
    this.volunteerRepository = volunteerRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.cycleRepository = cycleRepository;
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
    const nextAssignment = await this.unitOfWork.run(
      async (tx): Promise<Assignment> => {
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

        return nextAssignmentResult.assignment;
      },
    );

    if (!nextAssignment.participationId) {
      throw new Error('Assignment is missing a participation reference');
    }

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
}

function isActiveAssignmentStatus(status: Assignment['status']): boolean {
  return status === 'draft' || status === 'pending' || status === 'confirmed';
}
