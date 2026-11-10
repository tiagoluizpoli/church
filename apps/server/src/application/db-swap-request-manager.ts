import type { AppConfig } from '@church/app-config';
import { compareInstants, now as nowInstant } from '@church/time';
import type { ChurchId, UserId, VolunteerId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type { IChurchRecipients } from '../domain/contracts/application/church-recipients';
import type {
  ISwapRequestManager,
  RaisedSwapRequest,
  RaiseSwapRequestCommand,
  WithdrawSwapRequestCommand,
} from '../domain/contracts/application/swap-request-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import {
  isSwapRequestExpired,
  SwapRequest,
} from '../domain/entities/swap-request';
import { AssignmentAccessDeniedError } from '../domain/errors/assignment-access-denied';
import {
  SwapRequestAlreadyOpenError,
  SwapRequestNotOpenError,
  SwapRequestShiftStartedError,
  SwapRequestUnpublishedError,
} from '../domain/errors/swap-request';

interface AssertOwnAssignmentInput {
  churchId: ChurchId;
  userId: UserId;
  ownerVolunteerId: VolunteerId;
}

interface DbSwapRequestManagerDependencies {
  swapRequestRepo: SwapRequestRepository;
  assignmentRepo: AssignmentRepository;
  participationRepo: MinistryParticipationRepository;
  shiftRepo: ShiftRepository;
  eventRepo: EventRepository;
  ministryRepo: MinistryRepository;
  roleRepo: RoleRepository;
  churchRepo: ChurchRepository;
  volunteerRepo: VolunteerRepository;
  recipients: IChurchRecipients;
  notifications: IChurchNotifications;
  authorityManager: Pick<IAuthorityManager, 'decideAuthority'>;
  unitOfWork: UnitOfWork;
  config: AppConfig;
}

export class DbSwapRequestManager implements ISwapRequestManager {
  private readonly swapRequestRepo: SwapRequestRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly participationRepo: MinistryParticipationRepository;
  private readonly shiftRepo: ShiftRepository;
  private readonly eventRepo: EventRepository;
  private readonly ministryRepo: MinistryRepository;
  private readonly roleRepo: RoleRepository;
  private readonly churchRepo: ChurchRepository;
  private readonly volunteerRepo: VolunteerRepository;
  private readonly recipients: IChurchRecipients;
  private readonly notifications: IChurchNotifications;
  private readonly authorityManager: Pick<IAuthorityManager, 'decideAuthority'>;
  private readonly unitOfWork: UnitOfWork;
  private readonly noteMaxLength: number;

  constructor({
    swapRequestRepo,
    assignmentRepo,
    participationRepo,
    shiftRepo,
    eventRepo,
    ministryRepo,
    roleRepo,
    churchRepo,
    volunteerRepo,
    recipients,
    notifications,
    authorityManager,
    unitOfWork,
    config,
  }: DbSwapRequestManagerDependencies) {
    this.swapRequestRepo = swapRequestRepo;
    this.assignmentRepo = assignmentRepo;
    this.participationRepo = participationRepo;
    this.shiftRepo = shiftRepo;
    this.eventRepo = eventRepo;
    this.ministryRepo = ministryRepo;
    this.roleRepo = roleRepo;
    this.churchRepo = churchRepo;
    this.volunteerRepo = volunteerRepo;
    this.recipients = recipients;
    this.notifications = notifications;
    this.authorityManager = authorityManager;
    this.unitOfWork = unitOfWork;
    const { noteMaxLength } = config.swapRequest;
    this.noteMaxLength = noteMaxLength;
  }

  /** Self-service only (ADR-0009): the caller must be the Assignment's own Volunteer. */
  private async assertOwnAssignment({
    churchId,
    userId,
    ownerVolunteerId,
  }: AssertOwnAssignmentInput): Promise<void> {
    const decision = await this.authorityManager.decideAuthority({
      churchId,
      userId,
      action: 'participate',
      resource: { type: 'church', churchId, ownerVolunteerId },
      scope: 'object',
    });
    if (!decision.allowed) throw new AssignmentAccessDeniedError();
  }

  async raise({
    churchId,
    userId,
    assignmentId,
    note,
  }: RaiseSwapRequestCommand): Promise<RaisedSwapRequest> {
    const swapRequest = SwapRequest.raise({
      churchId,
      assignmentId,
      note,
      raisedBy: userId,
      noteMaxLength: this.noteMaxLength,
    });
    // One transaction: the Assignment row stays locked from its validation to the
    // insert, so a concurrent removal waits and the raise then reads it as gone.
    await this.unitOfWork.run(async (tx) => {
      const assignment = await this.assignmentRepo.getById({
        churchId,
        assignmentId,
        tx,
        forUpdate: true,
      });
      const { volunteerId, shiftId, participationId } = assignment;
      await this.assertOwnAssignment({
        churchId,
        userId,
        ownerVolunteerId: volunteerId,
      });
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
      if (
        compareInstants({ left: shift.startTime, right: nowInstant() }) <= 0
      ) {
        throw new SwapRequestShiftStartedError();
      }
      // Display facts for the N7 alert, frozen into the outbox rows.
      const { ministryId, eventId } = participation;
      const [event, ministry, church, people, roles, requirements] =
        await Promise.all([
          this.eventRepo.getById({ churchId, eventId }),
          this.ministryRepo.getById({ churchId, id: ministryId }),
          this.churchRepo.getById({ id: churchId }),
          this.volunteerRepo.listByIds({ churchId, ids: [volunteerId] }),
          this.roleRepo.listByMinistry({ churchId, ministryId }),
          this.shiftRepo.listRequirementsByParticipation({
            churchId,
            participationId,
          }),
        ]);
      const open = await this.swapRequestRepo.findOpenByAssignment({
        churchId,
        assignmentId,
        tx,
      });
      if (open) throw new SwapRequestAlreadyOpenError();
      await this.swapRequestRepo.create({ swapRequest, tx });
      const to = await this.recipients.ministryLeadersOrAdmins({
        tx,
        churchId,
        ministryId,
      });
      await this.notifications.enqueue({
        tx,
        kind: 'swap_request',
        to,
        data: {
          swapRequestId: swapRequest.id,
          cycleId: event.cycleId,
          ministryId,
          ministryName: ministry.name,
          churchName: church.name,
          churchTimezone: church.timezone,
          volunteerName: people[0]?.name ?? '',
          shift: {
            eventTitle: event.title,
            roleName:
              roles.find((role) => role.id === assignment.roleId)?.name ?? '',
            sectorName:
              requirements.find(
                (requirement) =>
                  requirement.id === assignment.shiftRequirementId,
              )?.sectorName ?? '',
            startsAt: shift.startTime,
            endsAt: shift.endTime,
          },
          note: swapRequest.note,
        },
      });
    });
    return {
      id: swapRequest.id,
      assignmentId,
      status: swapRequest.status,
      note: swapRequest.note,
      raisedAt: swapRequest.raisedAt,
    };
  }

  async withdraw({
    churchId,
    userId,
    assignmentId,
  }: WithdrawSwapRequestCommand): Promise<void> {
    const assignment = await this.assignmentRepo.getById({
      churchId,
      assignmentId,
    });
    await this.assertOwnAssignment({
      churchId,
      userId,
      ownerVolunteerId: assignment.volunteerId,
    });
    await this.unitOfWork.run(async (tx) => {
      const open = await this.swapRequestRepo.findOpenByAssignment({
        churchId,
        assignmentId,
        tx,
      });
      if (!open) throw new SwapRequestNotOpenError();
      if (assignment.shiftId) {
        const shift = await this.shiftRepo.getById({
          churchId,
          shiftId: assignment.shiftId,
        });
        if (
          isSwapRequestExpired({
            status: open.status,
            shiftStart: shift.startTime,
            at: nowInstant(),
          })
        ) {
          throw new SwapRequestNotOpenError();
        }
      }
      // Conditional on `open`: a request closed since the read above is a refusal.
      const closed = await this.swapRequestRepo.closeOpenByAssignment({
        churchId,
        assignmentId,
        status: 'withdrawn',
        closedBy: userId,
        tx,
      });
      if (!closed) throw new SwapRequestNotOpenError();
    });
  }
}
