import { NotFoundError } from '@church/core';
import { compareCalendarDays, now, today } from '@church/time';
import {
  CycleId,
  MinistryId,
  MinistryParticipationId,
} from '../domain/branded-ids';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityCheckRepository } from '../domain/contracts/infrastructure/availability-check.repository';
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
  CycleReadyToPrepareDeliveryFacts,
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
  availabilityCheckRepository: AvailabilityCheckRepository;
  roleRepository: RoleRepository;
  volunteerRepository: VolunteerRepository;
  /** Base URL of the web app, for deep links. */
  webBaseUrl: string;
}

interface ResolveAvailabilityInput {
  churchId: ChurchRecipient['churchId'];
  userId: ChurchRecipient['userId'];
  data: NotificationRequestDataOf<'availability_opened'>;
}

interface ResolveCycleReadyToPrepareInput {
  churchId: ChurchRecipient['churchId'];
  data: NotificationRequestDataOf<'cycle_ready_to_prepare'>;
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
  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
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
    availabilityCheckRepository,
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
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.roleRepository = roleRepository;
    this.volunteerRepository = volunteerRepository;
    this.webBaseUrl = webBaseUrl;
  }

  /**
   * N3/N4's facts for one recipient: their own relevant Shift count and the
   * ask record's current Deadline. A recipient no longer in the Ministry has
   * no count, and the words fall back to the Cycle span.
   */
  async availability({
    churchId,
    userId,
    data,
  }: ResolveAvailabilityInput): Promise<AvailabilityDeliveryFacts | null> {
    try {
      const schedule = {
        churchId,
        ministryId: MinistryId.from(data.ministryId),
        cycleId: CycleId.from(data.cycleId),
      };
      const [church, ministry, cycle, memberships, shiftTotals, answerBy] =
        await Promise.all([
          this.churchRepository.getById({ id: churchId }),
          this.ministryRepository.getById({
            churchId,
            id: schedule.ministryId,
          }),
          this.cycleRepository.getById({
            churchId,
            cycleId: schedule.cycleId,
          }),
          this.availabilityCheckRepository.listActiveMemberships(schedule),
          this.availabilityCheckRepository.listRelevantShiftTotals(schedule),
          this.availabilityCheckRepository.findAnswerBy(schedule),
        ]);
      const membership = memberships.find((row) => row.userId === userId);
      const shiftTotal = shiftTotals.find(
        (row) => row.ministryMembershipId === membership?.ministryMembershipId,
      );
      const churchToday = today({ instant: now(), timeZone: church.timezone });
      const deadline = answerBy && {
        answerBy,
        deadlinePassed:
          compareCalendarDays({ left: answerBy, right: churchToday }) < 0,
      };
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
        shiftCount: shiftTotal?.shiftCount,
        ...deadline,
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  /**
   * N2's facts: the Cycle, its live Event count and the captured Ministries
   * that still exist. One Ministry links to its Schedule; several link to the
   * Cycle-preserving picker restricted to them.
   */
  async cycleReadyToPrepare({
    churchId,
    data,
  }: ResolveCycleReadyToPrepareInput): Promise<CycleReadyToPrepareDeliveryFacts | null> {
    try {
      const cycleId = CycleId.from(data.cycleId);
      const [church, cycle, ministries, events] = await Promise.all([
        this.churchRepository.getById({ id: churchId }),
        this.cycleRepository.getById({ churchId, cycleId }),
        this.ministryRepository.listByChurch({
          churchId,
          ids: data.ministryIds.map((id) => MinistryId.from(id)),
        }),
        this.eventRepository.listCycleEvents({ churchId, cycleId }),
      ]);
      const [onlyMinistry, ...otherMinistries] = ministries;
      if (!onlyMinistry) return null;
      const ministryIds = ministries.map((ministry) => ministry.id).join(',');
      const path =
        otherMinistries.length === 0
          ? `/schedules/${onlyMinistry.id}/${cycle.id}`
          : `/schedules?cycleId=${cycle.id}&ministryIds=${ministryIds}`;
      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycleStartDate: cycle.startDate,
        cycleEndDate: cycle.endDate,
        eventCount: events.filter(
          (eventGroup) => eventGroup.event.status !== 'cancelled',
        ).length,
        ministries: ministries.map((ministry) => ({
          id: ministry.id,
          name: ministry.name,
        })),
        churchName: church.name,
        churchTimezone: church.timezone,
        actionUrl: webLink({ baseUrl: this.webBaseUrl, path }),
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
