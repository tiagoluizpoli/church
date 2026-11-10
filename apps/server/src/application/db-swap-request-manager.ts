import type { AppConfig } from '@church/app-config';
import { compareInstants, now as nowInstant } from '@church/time';
import type {
  ISwapRequestManager,
  RaisedSwapRequest,
  RaiseSwapRequestCommand,
} from '../domain/contracts/application/swap-request-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { SwapRequest } from '../domain/entities/swap-request';
import { AssignmentAccessDeniedError } from '../domain/errors/assignment-access-denied';
import {
  SwapRequestAlreadyOpenError,
  SwapRequestShiftStartedError,
  SwapRequestUnpublishedError,
} from '../domain/errors/swap-request';

interface DbSwapRequestManagerDependencies {
  swapRequestRepo: SwapRequestRepository;
  assignmentRepo: AssignmentRepository;
  participationRepo: MinistryParticipationRepository;
  shiftRepo: ShiftRepository;
  unitOfWork: UnitOfWork;
  config: AppConfig;
}

export class DbSwapRequestManager implements ISwapRequestManager {
  private readonly swapRequestRepo: SwapRequestRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly participationRepo: MinistryParticipationRepository;
  private readonly shiftRepo: ShiftRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly noteMaxLength: number;

  constructor({
    swapRequestRepo,
    assignmentRepo,
    participationRepo,
    shiftRepo,
    unitOfWork,
    config,
  }: DbSwapRequestManagerDependencies) {
    this.swapRequestRepo = swapRequestRepo;
    this.assignmentRepo = assignmentRepo;
    this.participationRepo = participationRepo;
    this.shiftRepo = shiftRepo;
    this.unitOfWork = unitOfWork;
    this.noteMaxLength = config.swapRequest.noteMaxLength;
  }

  async raise({
    churchId,
    userId,
    volunteerId,
    assignmentId,
    note,
  }: RaiseSwapRequestCommand): Promise<RaisedSwapRequest> {
    const assignment = await this.assignmentRepo.getById({
      churchId,
      assignmentId,
    });
    if (assignment.volunteerId !== volunteerId) {
      throw new AssignmentAccessDeniedError();
    }
    const { shiftId, participationId } = assignment;
    const published =
      assignment.status === 'pending' ||
      assignment.status === 'confirmed' ||
      assignment.status === 'declined';
    if (!published || !shiftId || !participationId) {
      throw new SwapRequestUnpublishedError();
    }
    const participation = await this.participationRepo.getById({
      churchId,
      participationId,
    });
    if (participation.state !== 'published') {
      throw new SwapRequestUnpublishedError();
    }
    // The Shift's own start, not the Event's (ADR-0003).
    const shift = await this.shiftRepo.getById({ churchId, shiftId });
    if (compareInstants({ left: shift.startTime, right: nowInstant() }) <= 0) {
      throw new SwapRequestShiftStartedError();
    }
    const swapRequest = SwapRequest.raise({
      churchId,
      assignmentId,
      note,
      raisedBy: userId,
      noteMaxLength: this.noteMaxLength,
    });
    // One transaction so a notification enqueue can join the insert.
    await this.unitOfWork.run(async (tx) => {
      const open = await this.swapRequestRepo.findOpenByAssignment({
        churchId,
        assignmentId,
        tx,
      });
      if (open) throw new SwapRequestAlreadyOpenError();
      await this.swapRequestRepo.create({ swapRequest, tx });
    });
    return {
      id: swapRequest.id,
      assignmentId,
      status: swapRequest.status,
      note: swapRequest.note,
      raisedAt: swapRequest.raisedAt,
    };
  }
}
