import type { AppConfig } from '@church/app-config';
import { compareInstants, now as nowInstant } from '@church/time';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type { IChurchRecipients } from '../domain/contracts/application/church-recipients';
import type {
  ISwapRequestManager,
  RaisedSwapRequest,
  RaiseSwapRequestCommand,
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
  eventRepo: EventRepository;
  ministryRepo: MinistryRepository;
  roleRepo: RoleRepository;
  churchRepo: ChurchRepository;
  volunteerRepo: VolunteerRepository;
  recipients: IChurchRecipients;
  notifications: IChurchNotifications;
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
}
