import { HardConstraintError } from '../domain/conflict/errors/hard-constraint-error';
import type {
  CreateParticipationAssignmentInput,
  CreateParticipationAssignmentResult,
  DeleteAssignmentInput,
  GetAssignmentInput,
  IAssignmentManager,
  ListCycleAuditLogInput,
  MoveParticipationAssignmentInput,
  ReassignParticipationAssignmentInput,
} from '../domain/contracts/application/assignment-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { AssignmentAudit } from '../domain/entities/assignment-audit';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
import {
  AssignmentFactsReader,
  AssignmentLifecycle,
} from './assignment-lifecycle';

interface CreateParticipationAssignmentTransactionInput {
  input: CreateParticipationAssignmentInput;
  tx: TransactionContext;
  participation: MinistryParticipation;
  /** The Assignment a reassignment replaces; it does not take a place. */
  replacingId?: Assignment['id'];
}

interface DbAssignmentManagerDependencies {
  assignmentRepo: AssignmentRepository;
  auditRepo: AssignmentAuditRepository;
  shiftRepository: ShiftRepository;
  participationRepository: MinistryParticipationRepository;
  volunteerRepository: VolunteerRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  cycleRepository: CycleRepository;
  eventRepository: EventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  swapRequestRepo: SwapRequestRepository;
  unitOfWork: UnitOfWork;
}

export class DbAssignmentManager implements IAssignmentManager {
  private readonly assignmentRepo: AssignmentRepository;
  private readonly auditRepo: AssignmentAuditRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly lifecycle: AssignmentLifecycle;
  private readonly factsReader: AssignmentFactsReader;

  constructor({
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    eventRepository,
    eventTimeBlockRepository,
    swapRequestRepo,
    unitOfWork,
  }: DbAssignmentManagerDependencies) {
    this.assignmentRepo = assignmentRepo;
    this.auditRepo = auditRepo;
    this.shiftRepository = shiftRepository;
    this.participationRepository = participationRepository;
    this.cycleRepository = cycleRepository;
    this.unitOfWork = unitOfWork;
    this.lifecycle = new AssignmentLifecycle({
      assignmentRepository: assignmentRepo,
      auditRepository: auditRepo,
      swapRequestRepository: swapRequestRepo,
      participationRepository,
    });
    this.factsReader = new AssignmentFactsReader({
      assignmentRepository: assignmentRepo,
      shiftRepository,
      eventRepository,
      eventTimeBlockRepository,
      volunteerRepository,
      unavailableShiftRepository,
    });
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
    return this.unitOfWork.run(async (tx) => {
      // Overlap is checked against Shift bounds an Event move rewrites, so
      // creation shares move confirmation's Church lock, taken before any
      // Participation lock (every holder of both takes the Church lock first).
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });
      // Read unlocked only to name the Participation row. Saves and Publish
      // take the same lock before reading the committed Shift graph.
      const { participationId } = await this.shiftRepository.getById({
        churchId: input.churchId,
        shiftId: input.shiftId,
        tx,
      });
      const participation = await this.participationRepository.lockById({
        churchId: input.churchId,
        participationId,
        tx,
      });
      return this.createParticipationAssignmentInTransaction({
        input,
        tx,
        participation,
      });
    });
  }

  async deleteAssignment(input: DeleteAssignmentInput): Promise<void> {
    const { assignmentId, churchId, actorId } = input;
    await this.unitOfWork.run(async (tx) => {
      const assignment = await this.assignmentRepo.getById({
        churchId,
        assignmentId,
        tx,
      });
      if (!assignment.shiftId || !assignment.participationId)
        throw new Error('Assignment is missing a schedule reference');
      await this.participationRepository.lockById({
        churchId,
        participationId: assignment.participationId,
        tx,
      });
      const shift = await this.shiftRepository.getById({
        churchId,
        shiftId: assignment.shiftId,
        tx,
      });
      this.lifecycle.assertNotStarted({ startTime: shift.startTime });
      await this.lifecycle.remove({ churchId, assignmentId, actorId, tx });
    });
  }

  async reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment> {
    const nextAssignment = await this.unitOfWork.run(
      async (tx): Promise<Assignment> => {
        // Creates an Assignment: the same Church lock as creation.
        await this.cycleRepository.acquireChurchLock({
          churchId: input.churchId,
          tx,
        });
        const initial = await this.assignmentRepo.getById({
          churchId: input.churchId,
          assignmentId: input.assignmentId,
          tx,
        });
        if (!initial.participationId)
          throw new Error('Assignment is missing a participation reference');
        const participation = await this.participationRepository.lockById({
          churchId: input.churchId,
          participationId: initial.participationId,
          tx,
        });
        // A move may have committed while this call waited for the lock.
        const currentAssignment = await this.assignmentRepo.getById({
          churchId: input.churchId,
          assignmentId: input.assignmentId,
          tx,
        });
        if (!currentAssignment.shiftId)
          throw new Error('Assignment is missing a shift reference');
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
            participation,
            replacingId: currentAssignment.id,
          });
        if (!nextAssignmentResult.assignment.participationId) {
          throw new Error('Assignment is missing a participation reference');
        }

        await this.lifecycle.replace({
          churchId: input.churchId,
          replacedId: currentAssignment.id,
          replacement: nextAssignmentResult.assignment,
          actorId: input.actorId,
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

  async moveParticipationAssignment(
    input: MoveParticipationAssignmentInput,
  ): Promise<Assignment> {
    return this.unitOfWork.run(async (tx) => {
      const initial = await this.assignmentRepo.getById({
        churchId: input.churchId,
        assignmentId: input.assignmentId,
        tx,
      });
      if (!initial.participationId || !initial.shiftId)
        throw new Error('Assignment is missing its schedule reference');
      await this.participationRepository.lockById({
        churchId: input.churchId,
        participationId: initial.participationId,
        tx,
      });
      const current = await this.assignmentRepo.getById({
        churchId: input.churchId,
        assignmentId: input.assignmentId,
        tx,
      });
      const { facts, target } = await this.factsReader.forMove({
        churchId: input.churchId,
        current,
        shiftRequirementId: input.shiftRequirementId,
        tx,
      });
      this.lifecycle.admit({
        check: 'move',
        facts,
        notOnShift: () =>
          new HardConstraintError({
            reason: 'INVALID_MOVE_TARGET',
            message: 'Move target must have the same shift and role',
          }),
      });
      if (!target) throw new Error('Move target was admitted without a need');
      const moved = await this.lifecycle.move({
        churchId: input.churchId,
        assignmentId: current.id,
        shiftRequirementId: target.id,
        actorId: input.actorId,
        tx,
      });
      return moved;
    });
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
    participation,
    replacingId,
  }: CreateParticipationAssignmentTransactionInput): Promise<CreateParticipationAssignmentResult> {
    const facts = await this.factsReader.forAssign({
      churchId: input.churchId,
      participation,
      shiftId: input.shiftId,
      shiftRequirementId: input.shiftRequirementId,
      volunteerId: input.volunteerId,
      replacingId,
      tx,
    });
    return this.lifecycle.assign({
      churchId: input.churchId,
      participation,
      volunteerId: input.volunteerId,
      actorId: input.actorId,
      facts,
      tx,
    });
  }
}
