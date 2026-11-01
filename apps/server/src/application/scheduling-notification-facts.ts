import { NotFoundError } from '@church/core';
import {
  CycleId,
  MinistryId,
  MinistryParticipationId,
} from '../domain/branded-ids';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type {
  AvailabilityDeliveryFacts,
  NotificationRequestDataOf,
  SchedulePublishedDeliveryFacts,
} from '../domain/notification-kinds';
import { webLink } from '../domain/services/web-link';

interface SchedulingNotificationFactsDependencies {
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  cycleRepository: CycleRepository;
  participationRepository: MinistryParticipationRepository;
  eventRepository: PlanningEventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  assignmentRepository: AssignmentRepository;
  roleRepository: RoleRepository;
  volunteerRepository: VolunteerRepository;
  /** Base URL of the web app, for deep links. */
  webBaseUrl: string;
}

interface ResolveAvailabilityInput {
  churchId: ChurchRecipient['churchId'];
  data: NotificationRequestDataOf<'availability_opened'>;
}

interface ResolveSchedulePublishedInput {
  churchId: ChurchRecipient['churchId'];
  userId: ChurchRecipient['userId'];
  data: NotificationRequestDataOf<'schedule_published'>;
}

/**
 * The display facts of the retained scheduling kinds, read at delivery from
 * the identifiers enqueued with the change. `null` when the scheduling object
 * no longer exists: the history cannot be rendered, so the row fails
 * terminally rather than retrying.
 */
export class SchedulingNotificationFacts {
  private readonly churchRepository: ChurchRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly assignmentRepository: AssignmentRepository;
  private readonly roleRepository: RoleRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly webBaseUrl: string;

  constructor({
    churchRepository,
    ministryRepository,
    cycleRepository,
    participationRepository,
    eventRepository,
    eventTimeBlockRepository,
    assignmentRepository,
    roleRepository,
    volunteerRepository,
    webBaseUrl,
  }: SchedulingNotificationFactsDependencies) {
    this.churchRepository = churchRepository;
    this.ministryRepository = ministryRepository;
    this.cycleRepository = cycleRepository;
    this.participationRepository = participationRepository;
    this.eventRepository = eventRepository;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.assignmentRepository = assignmentRepository;
    this.roleRepository = roleRepository;
    this.volunteerRepository = volunteerRepository;
    this.webBaseUrl = webBaseUrl;
  }

  async availability({
    churchId,
    data,
  }: ResolveAvailabilityInput): Promise<AvailabilityDeliveryFacts | null> {
    try {
      const [church, ministry, cycle] = await Promise.all([
        this.churchRepository.getById({ id: churchId }),
        this.ministryRepository.getById({
          churchId,
          id: MinistryId.from(data.ministryId),
        }),
        this.cycleRepository.getById({
          churchId,
          cycleId: CycleId.from(data.cycleId),
        }),
      ]);
      return {
        cycleId: cycle.id,
        ministryId: ministry.id,
        ministryName: ministry.name,
        churchName: church.name,
        cycleName: cycle.name,
        cycleStartDate: cycle.startDate,
        cycleEndDate: cycle.endDate,
        actionUrl: webLink({
          baseUrl: this.webBaseUrl,
          path: '/dashboard?section=availability',
        }),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async schedulePublished({
    churchId,
    userId,
    data,
  }: ResolveSchedulePublishedInput): Promise<SchedulePublishedDeliveryFacts | null> {
    try {
      const participation = await this.participationRepository.getById({
        churchId,
        participationId: MinistryParticipationId.from(data.participationId),
      });
      const [church, ministry, event, volunteer, assignments] =
        await Promise.all([
          this.churchRepository.getById({ id: churchId }),
          this.ministryRepository.getById({
            churchId,
            id: participation.ministryId,
          }),
          this.eventRepository.getEvent({
            churchId,
            eventId: participation.eventId,
          }),
          this.volunteerRepository.findByUserId({ churchId, userId }),
          this.assignmentRepository.listByParticipation({
            churchId,
            participationId: participation.id,
          }),
        ]);
      const own = assignments.filter(
        (assignment) =>
          assignment.volunteerId === volunteer?.id &&
          ['draft', 'pending', 'confirmed'].includes(assignment.status),
      );
      const shifts = await Promise.all(
        own.map(async (assignment) => {
          const [role, block] = await Promise.all([
            this.roleRepository.getById({ churchId, id: assignment.roleId }),
            this.eventTimeBlockRepository.getById({
              churchId,
              eventTimeBlockId: assignment.eventTimeBlockId,
            }),
          ]);
          return { roleName: role.name, startsAt: block.startTime };
        }),
      );
      return {
        eventId: event.id,
        cycleId: event.cycleId,
        ministryId: ministry.id,
        ministryName: ministry.name,
        churchName: church.name,
        eventTitle: event.title,
        eventStart: event.start,
        eventEnd: event.end,
        churchTimezone: church.timezone,
        shifts,
        actionUrl: webLink({
          baseUrl: this.webBaseUrl,
          path: `/dashboard?section=assignments&eventId=${event.id}&ministryId=${ministry.id}`,
        }),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
