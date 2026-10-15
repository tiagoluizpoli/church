import type { CycleId } from '../domain/branded-ids';
import type {
  AskAvailabilityInput,
  AskAvailabilityResult,
  CheckStatusRow,
  IAvailabilityCheckManager,
  ListCheckStatusesInput,
  ListCycleCheckStatusesInput,
  ResendReminderInput,
} from '../domain/contracts/application/availability-check-manager';
import type {
  ActiveMinistryMembership,
  AvailabilityCheckRepository,
} from '../domain/contracts/infrastructure/availability-check.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
import { IllegalStateTransitionError } from '../domain/errors';

interface NotifyMembershipsInput {
  churchId: AskAvailabilityInput['churchId'];
  participation: MinistryParticipation;
  cycleId: CycleId;
  memberships: ActiveMinistryMembership[];
}

interface DbAvailabilityCheckManagerDependencies {
  participationRepository: MinistryParticipationRepository;
  eventRepository: PlanningEventRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  notificationService: NotificationService;
  unitOfWork: UnitOfWork;
}

export class DbAvailabilityCheckManager implements IAvailabilityCheckManager {
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
  private readonly notificationService: NotificationService;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    participationRepository,
    eventRepository,
    availabilityCheckRepository,
    notificationService,
    unitOfWork,
  }: DbAvailabilityCheckManagerDependencies) {
    this.participationRepository = participationRepository;
    this.eventRepository = eventRepository;
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.notificationService = notificationService;
    this.unitOfWork = unitOfWork;
  }

  async askAvailability(
    input: AskAvailabilityInput,
  ): Promise<AskAvailabilityResult> {
    const requested = await this.unitOfWork.run(async (tx) => {
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      // Entity transition guards the state machine (prepare → availability_requested).
      participation.askAvailability();

      const event = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: participation.eventId,
        tx,
      });
      const cycleId = event.cycleId;

      const memberships =
        await this.availabilityCheckRepository.listActiveMemberships({
          churchId: input.churchId,
          ministryId: participation.ministryId,
          tx,
        });
      const existingChecks = await this.availabilityCheckRepository.listByCycle(
        {
          churchId: input.churchId,
          cycleId,
          ministryVolunteerIds: memberships.map(
            (membership) => membership.ministryVolunteerId,
          ),
          tx,
        },
      );
      const existingMembershipIds = new Set(
        existingChecks.map((check) => check.ministryVolunteerId),
      );
      const missingMemberships = memberships.filter(
        (membership) =>
          !existingMembershipIds.has(membership.ministryVolunteerId),
      );

      const createdChecks = await this.availabilityCheckRepository.createMany({
        churchId: input.churchId,
        checks: missingMemberships.map((membership) => ({
          cycleId,
          ministryVolunteerId: membership.ministryVolunteerId,
        })),
        tx,
      });

      await this.participationRepository.updateState({
        churchId: input.churchId,
        participationId: input.participationId,
        state: participation.state,
        tx,
      });

      return {
        participation,
        cycleId,
        createdCheckCount: createdChecks.length,
        newMemberships: missingMemberships,
      };
    });

    await this.notifyMemberships({
      churchId: input.churchId,
      participation: requested.participation,
      cycleId: requested.cycleId,
      memberships: requested.newMemberships,
    });

    return {
      createdCheckCount: requested.createdCheckCount,
      notifiedVolunteerCount: requested.newMemberships.length,
    };
  }

  async listCheckStatuses(
    input: ListCheckStatusesInput,
  ): Promise<CheckStatusRow[]> {
    const participation = await this.participationRepository.getById({
      churchId: input.churchId,
      participationId: input.participationId,
    });
    const event = await this.eventRepository.getEvent({
      churchId: input.churchId,
      eventId: participation.eventId,
    });
    return this.listCycleCheckStatuses({
      churchId: input.churchId,
      cycleId: event.cycleId,
      ministryId: participation.ministryId,
    });
  }

  async listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CheckStatusRow[]> {
    const memberships =
      await this.availabilityCheckRepository.listActiveMemberships({
        churchId: input.churchId,
        ministryId: input.ministryId,
      });
    const checks = await this.availabilityCheckRepository.listByCycle({
      churchId: input.churchId,
      cycleId: input.cycleId,
      ministryVolunteerIds: memberships.map(
        (membership) => membership.ministryVolunteerId,
      ),
    });
    const checkByMembershipId = new Map(
      checks.map((check) => [check.ministryVolunteerId, check]),
    );

    return memberships.map((membership) => {
      const check = checkByMembershipId.get(membership.ministryVolunteerId);
      return {
        volunteerId: membership.volunteerId as string,
        volunteerName: membership.volunteerName,
        state: check?.state,
        confirmedAt: check?.confirmedAt,
      };
    });
  }

  async resendReminder(input: ResendReminderInput): Promise<void> {
    const participation = await this.participationRepository.getById({
      churchId: input.churchId,
      participationId: input.participationId,
    });

    if (participation.state === 'preparing') {
      throw new IllegalStateTransitionError(participation.state, 'resend');
    }

    const event = await this.eventRepository.getEvent({
      churchId: input.churchId,
      eventId: participation.eventId,
    });
    const memberships =
      await this.availabilityCheckRepository.listActiveMemberships({
        churchId: input.churchId,
        ministryId: participation.ministryId,
      });
    const checks = await this.availabilityCheckRepository.listByCycle({
      churchId: input.churchId,
      cycleId: event.cycleId,
      ministryVolunteerIds: memberships.map(
        (membership) => membership.ministryVolunteerId,
      ),
    });
    const pendingMembershipIds = new Set(
      checks
        .filter((check) => check.state === 'pending')
        .map((check) => check.ministryVolunteerId),
    );
    const pendingMemberships = memberships.filter((membership) =>
      pendingMembershipIds.has(membership.ministryVolunteerId),
    );

    await this.notifyMemberships({
      churchId: input.churchId,
      participation,
      cycleId: event.cycleId,
      memberships: pendingMemberships,
    });
  }

  private async notifyMemberships({
    churchId,
    participation,
    cycleId,
    memberships,
  }: NotifyMembershipsInput): Promise<void> {
    for (const membership of memberships) {
      await this.notificationService.notifyVolunteer({
        churchId: churchId as string,
        volunteerId: membership.volunteerId as string,
        cycleId,
        ministryId: participation.ministryId,
        type: 'availability_reminder',
        title: 'Availability check',
        body: 'Your ministry leader asked for your availability for an upcoming planning period.',
        payload: {
          cycleId: cycleId as string,
          ministryId: participation.ministryId as string,
        },
      });
    }
  }
}
