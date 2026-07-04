import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { PlanningCycleId } from '../domain/branded-ids';
import type {
  CheckStatusRow,
  FireAvailabilityInput,
  FireAvailabilityResult,
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
  churchId: FireAvailabilityInput['churchId'];
  participation: MinistryParticipation;
  planningCycleId: PlanningCycleId;
  memberships: ActiveMinistryMembership[];
}

@injectable()
export class DbAvailabilityCheckManager implements IAvailabilityCheckManager {
  constructor(
    @inject('IMinistryParticipationRepository')
    private readonly participationRepository: MinistryParticipationRepository,
    @inject('IPlanningEventRepository')
    private readonly eventRepository: PlanningEventRepository,
    @inject('IAvailabilityCheckRepository')
    private readonly availabilityCheckRepository: AvailabilityCheckRepository,
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async fireAvailability(
    input: FireAvailabilityInput,
  ): Promise<FireAvailabilityResult> {
    const fired = await this.unitOfWork.run(async (tx) => {
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      // Entity transition guards the state machine (tailoring → availability_fired).
      participation.fireAvailability();

      const event = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: participation.eventId,
        tx,
      });
      const planningCycleId = event.planningCycleId;

      const memberships =
        await this.availabilityCheckRepository.listActiveMemberships({
          churchId: input.churchId,
          ministryId: participation.ministryId,
          tx,
        });
      const existingChecks = await this.availabilityCheckRepository.listByCycle(
        {
          churchId: input.churchId,
          planningCycleId,
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
          planningCycleId,
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
        planningCycleId,
        createdCheckCount: createdChecks.length,
        newMemberships: missingMemberships,
      };
    });

    await this.notifyMemberships({
      churchId: input.churchId,
      participation: fired.participation,
      planningCycleId: fired.planningCycleId,
      memberships: fired.newMemberships,
    });

    return {
      createdCheckCount: fired.createdCheckCount,
      notifiedVolunteerCount: fired.newMemberships.length,
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
      cycleId: event.planningCycleId,
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
      planningCycleId: input.cycleId,
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

    if (participation.state === 'tailoring') {
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
      planningCycleId: event.planningCycleId,
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
      planningCycleId: event.planningCycleId,
      memberships: pendingMemberships,
    });
  }

  private async notifyMemberships({
    churchId,
    participation,
    planningCycleId,
    memberships,
  }: NotifyMembershipsInput): Promise<void> {
    for (const membership of memberships) {
      await this.notificationService.notifyVolunteer({
        churchId: churchId as string,
        volunteerId: membership.volunteerId as string,
        planningCycleId,
        ministryId: participation.ministryId,
        type: 'availability_reminder',
        title: 'Availability check',
        body: 'Your ministry leader asked for your availability for an upcoming planning period.',
        payload: {
          planningCycleId: planningCycleId as string,
          ministryId: participation.ministryId as string,
        },
      });
    }
  }
}
