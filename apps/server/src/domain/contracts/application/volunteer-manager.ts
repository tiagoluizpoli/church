import type {
  AssignmentId,
  AvailabilityId,
  ChurchId,
  EventId,
  MinistryId,
  UserId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type {
  Availability,
  AvailabilityType,
} from '../../entities/availability';
import type { VolunteerNotification } from '../../entities/volunteer-notification';

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

export interface GetDashboardInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetUpcomingAssignmentsInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetMinistryScheduleInput {
  ministryId: MinistryId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface DeleteAvailabilityInput {
  availabilityId: AvailabilityId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetAvailabilityInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  startTime?: Date;
  endTime?: Date;
}

export interface GetNotificationsInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  cursor?: Date;
  limit?: number;
}

export interface MarkNotificationReadInput {
  notificationId: VolunteerNotificationId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface MarkAllNotificationsReadInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface VolunteerContext {
  churchId: ChurchId;
  isAdmin: boolean;
  isLeader: boolean;
  volunteerId: VolunteerId;
}

export interface IVolunteerManager {
  resolveVolunteerContext(userId: UserId): Promise<VolunteerContext | null>;
  getDashboard(input: GetDashboardInput): Promise<VolunteerDashboard>;
  getUpcomingAssignments(
    input: GetUpcomingAssignmentsInput,
  ): Promise<Assignment[]>;
  getMinistrySchedule(
    input: GetMinistryScheduleInput,
  ): Promise<MinistrySchedule>;
  upsertAvailability(input: UpsertAvailabilityInput): Promise<Availability>;
  deleteAvailability(input: DeleteAvailabilityInput): Promise<void>;
  getAvailability(input: GetAvailabilityInput): Promise<Availability[]>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  getNotifications(
    input: GetNotificationsInput,
  ): Promise<NotificationListResult>;
  markNotificationRead(input: MarkNotificationReadInput): Promise<void>;
  markAllNotificationsRead(input: MarkAllNotificationsReadInput): Promise<void>;
}
