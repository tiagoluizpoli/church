import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  IVolunteerManager,
  NotificationListResult,
  RespondToAssignmentInput,
  UpsertAvailabilityInput,
  VolunteerContext,
  VolunteerDashboard,
} from '../domain/contracts/application/volunteer-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerNotificationRepository } from '../domain/contracts/infrastructure/volunteer-notification.repository';
import type { Assignment } from '../domain/entities/assignment';
import type {
  Availability,
  AvailabilityId,
} from '../domain/entities/availability';
import type { ChurchId } from '../domain/entities/church';
import type { MinistryId } from '../domain/entities/ministry';
import type { UserId, VolunteerId } from '../domain/entities/volunteer';
import type { VolunteerNotificationId } from '../domain/entities/volunteer-notification';

const UPCOMING_DAYS = 30;
const DEFAULT_NOTIFICATION_LIMIT = 20;

const ADMINISTRATION_MINISTRY_NAME = 'Administration';

@injectable()
export class DbVolunteerManager implements IVolunteerManager {
  constructor(
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
    @inject('IAssignmentRepository')
    private readonly assignmentRepo: AssignmentRepository,
    @inject('IAvailabilityRepository')
    private readonly availabilityRepo: AvailabilityRepository,
    @inject('IVolunteerNotificationRepository')
    private readonly notificationRepo: VolunteerNotificationRepository,
  ) {}

  async resolveVolunteerContext(
    userId: UserId,
  ): Promise<VolunteerContext | null> {
    const volunteer = await this.volunteerRepo.findByUserIdGlobally(userId);
    if (!volunteer) return null;
    const ledMinistries = await this.volunteerRepo.listLedMinistries(
      volunteer.churchId,
      volunteer.id,
    );
    return {
      volunteerId: volunteer.id,
      churchId: volunteer.churchId,
      isAdmin: ledMinistries.some(
        (m) => m.ministryName === ADMINISTRATION_MINISTRY_NAME,
      ),
      isLeader: ledMinistries.length > 0,
    };
  }

  async getDashboard(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<VolunteerDashboard> {
    const { volunteerId, churchId } = input;
    const now = new Date();
    const future = new Date(
      now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000,
    );

    const [upcomingAssignments, unreadNotificationCount] = await Promise.all([
      this.assignmentRepo.listByVolunteerInRange(
        churchId,
        volunteerId,
        now,
        future,
      ),
      this.notificationRepo.countUnread(churchId, volunteerId),
    ]);

    return { upcomingAssignments, unreadNotificationCount };
  }

  async getUpcomingAssignments(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Assignment[]> {
    const { volunteerId, churchId } = input;
    const now = new Date();
    const future = new Date(
      now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.assignmentRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      now,
      future,
    );
  }

  async getMinistrySchedule(input: {
    ministryId: MinistryId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Assignment[]> {
    return this.assignmentRepo.listByVolunteer(
      input.churchId,
      input.volunteerId,
    );
  }

  async upsertAvailability(
    input: UpsertAvailabilityInput,
  ): Promise<Availability> {
    const {
      churchId,
      availabilityId,
      volunteerId,
      eventId,
      type,
      startTime,
      endTime,
      isAllDay,
      reason,
      repeatRule,
    } = input;
    if (availabilityId) {
      await this.availabilityRepo.update(churchId, availabilityId, {
        eventId,
        type,
        startTime,
        endTime,
        isAllDay,
        reason,
        repeatRule,
      });
      return this.availabilityRepo.getById(churchId, availabilityId);
    }
    return this.availabilityRepo.create(churchId, {
      volunteerId,
      eventId,
      type,
      startTime,
      endTime,
      isAllDay,
      reason,
      repeatRule,
    });
  }

  async deleteAvailability(input: {
    availabilityId: AvailabilityId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    return this.availabilityRepo.delete(input.churchId, input.availabilityId);
  }

  async getAvailability(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    startTime?: Date;
    endTime?: Date;
  }): Promise<Availability[]> {
    const { volunteerId, churchId, startTime, endTime } = input;
    const start = startTime ?? new Date(0);
    const end = endTime ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    return this.availabilityRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      start,
      end,
    );
  }

  async respondToAssignment(
    input: RespondToAssignmentInput,
  ): Promise<Assignment> {
    const { assignmentId, churchId, response, reason } = input;
    const status = response === 'accepted' ? 'confirmed' : 'declined';
    await this.assignmentRepo.updateStatus(churchId, assignmentId, {
      status,
      reason,
    });
    return this.assignmentRepo.getById(churchId, assignmentId);
  }

  async getNotifications(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    cursor?: Date;
    limit?: number;
  }): Promise<NotificationListResult> {
    const {
      volunteerId,
      churchId,
      cursor,
      limit = DEFAULT_NOTIFICATION_LIMIT,
    } = input;
    return this.notificationRepo.listByVolunteer(churchId, {
      volunteerId,
      cursor,
      limit,
    });
  }

  async markNotificationRead(input: {
    notificationId: VolunteerNotificationId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    const { notificationId, volunteerId, churchId } = input;
    await this.notificationRepo.markRead(churchId, volunteerId, notificationId);
  }

  async markAllNotificationsRead(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    await this.notificationRepo.markAllRead(input.churchId, input.volunteerId);
  }
}
