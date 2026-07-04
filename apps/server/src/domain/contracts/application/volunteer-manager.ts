import type {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { AvailabilityCheckState } from '../../entities/availability-check';
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

export interface VolunteerAvailabilityCheckSummary {
  id: string;
  planningCycleId: string;
  planningCycleName: string;
  ministryId: string;
  ministryName: string;
  state: AvailabilityCheckState;
  confirmedAt?: Date;
  totalShiftCount: number;
  unavailableShiftCount: number;
}

export interface VolunteerCheckShift {
  shiftId: string;
  eventId: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  label?: string;
  available: boolean;
}

export interface VolunteerAvailabilityCheckDetail {
  id: string;
  planningCycleId: string;
  planningCycleName: string;
  ministryId: string;
  ministryName: string;
  state: AvailabilityCheckState;
  confirmedAt?: Date;
  shifts: VolunteerCheckShift[];
}

export interface ListAvailabilityChecksInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetAvailabilityCheckInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface SetUnavailabilityInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
  shiftIds: ShiftId[];
  /** Church-local dates (`yyyy-MM-dd`); each expands to one mark per shift on that date. */
  wholeDayDates?: string[];
}

export interface ConfirmAvailabilityCheckInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface AvailabilityOverlapItem {
  shiftId: string;
  otherShiftId: string;
  ministryId: string;
  otherMinistryId: string;
}

export interface ConfirmAvailabilityCheckResult {
  state: AvailabilityCheckState;
  confirmedAt: Date;
  overlaps: AvailabilityOverlapItem[];
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
  listAvailabilityChecks(
    input: ListAvailabilityChecksInput,
  ): Promise<VolunteerAvailabilityCheckSummary[]>;
  getAvailabilityCheck(
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  setUnavailability(
    input: SetUnavailabilityInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  confirmAvailabilityCheck(
    input: ConfirmAvailabilityCheckInput,
  ): Promise<ConfirmAvailabilityCheckResult>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  getNotifications(
    input: GetNotificationsInput,
  ): Promise<NotificationListResult>;
  markNotificationRead(input: MarkNotificationReadInput): Promise<void>;
  markAllNotificationsRead(input: MarkAllNotificationsReadInput): Promise<void>;
}
