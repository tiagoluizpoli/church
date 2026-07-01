import type { Assignment, AssignmentId } from '../../entities/assignment';
import type {
  Availability,
  AvailabilityId,
  AvailabilityType,
} from '../../entities/availability';
import type { ChurchId } from '../../entities/church';
import type { EventId } from '../../entities/event';
import type { MinistryId } from '../../entities/ministry';
import type { UserId, VolunteerId } from '../../entities/volunteer';
import type {
  VolunteerNotification,
  VolunteerNotificationId,
} from '../../entities/volunteer-notification';

export interface VolunteerDashboard {
  upcomingAssignments: Assignment[];
  unreadNotificationCount: number;
}

export interface UpsertAvailabilityInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  availabilityId?: AvailabilityId;
  eventId?: EventId;
  type: AvailabilityType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
}

export interface RespondToAssignmentInput {
  assignmentId: AssignmentId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
  response: 'accepted' | 'declined';
  reason?: string;
}

export interface NotificationListResult {
  items: VolunteerNotification[];
  nextCursor?: Date;
}

export interface VolunteerContext {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  isAdmin: boolean;
  isLeader: boolean;
}

export interface IVolunteerManager {
  resolveVolunteerContext(userId: UserId): Promise<VolunteerContext | null>;
  getDashboard(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<VolunteerDashboard>;
  getUpcomingAssignments(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Assignment[]>;
  getMinistrySchedule(input: {
    ministryId: MinistryId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Assignment[]>;
  upsertAvailability(input: UpsertAvailabilityInput): Promise<Availability>;
  deleteAvailability(input: {
    availabilityId: AvailabilityId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void>;
  getAvailability(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    startTime?: Date;
    endTime?: Date;
  }): Promise<Availability[]>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  getNotifications(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    cursor?: Date;
    limit?: number;
  }): Promise<NotificationListResult>;
  markNotificationRead(input: {
    notificationId: VolunteerNotificationId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void>;
  markAllNotificationsRead(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void>;
}
