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

export interface DashboardAvailabilityTask {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventType: 'hourly' | 'day_based';
  eventStart: string;
  eventEnd: string;
  completionState: 'missing' | 'partial' | 'complete';
}

export interface DashboardAssignmentItem {
  assignmentId: string;
  slotId: string;
  roleId: string;
  roleName: string;
  teamId?: string;
  teamName?: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'declined';
  timingState: 'in_progress' | 'upcoming';
  canRespond: boolean;
}

export interface DashboardAssignmentGroup {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  aggregateResponseState: 'pending' | 'confirmed' | 'mixed' | 'declined';
  hasPendingResponse: boolean;
  assignments: DashboardAssignmentItem[];
}

export interface DashboardNotificationPreview {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface DashboardMinistryOption {
  id: string;
  name: string;
}

export interface VolunteerDashboard {
  availabilityTasks: DashboardAvailabilityTask[];
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  unreadNotificationCount: number;
  notificationPreview: DashboardNotificationPreview[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
}

export interface MinistryScheduleRow {
  slotId: string;
  slotLabel: string;
  roleName: string;
  teamName?: string;
  volunteerDisplayName?: string;
  confirmationState: 'pending' | 'confirmed' | 'declined' | 'open';
}

export interface MinistryScheduleEvent {
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  assignmentCount: number;
  rows: MinistryScheduleRow[];
}

export interface MinistrySchedule {
  ministryId: string;
  ministryName: string;
  events: MinistryScheduleEvent[];
}

export interface UpsertAvailabilityInput {
  availabilityId?: AvailabilityId;
  churchId: ChurchId;
  endTime: Date;
  eventId?: EventId;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
  startTime: Date;
  type: AvailabilityType;
  volunteerId: VolunteerId;
}

export interface RespondToAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  reason?: string;
  response: 'accepted' | 'declined';
  volunteerId: VolunteerId;
}

export interface NotificationListResult {
  items: VolunteerNotification[];
  nextCursor?: Date;
}

export interface VolunteerContext {
  churchId: ChurchId;
  isAdmin: boolean;
  isLeader: boolean;
  volunteerId: VolunteerId;
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
  }): Promise<MinistrySchedule>;
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
