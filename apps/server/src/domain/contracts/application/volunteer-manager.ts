import type { Instant } from '@church/time';
import type {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { AvailabilityCheckState } from '../../entities/availability-check';
import type { Notification } from '../../entities/notification';

export interface DashboardAvailabilityTask {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  eventEnd: string;
  completionState: 'missing' | 'partial' | 'complete';
}

export interface DashboardAssignmentItem {
  assignmentId: string;
  eventTimeBlockId: string;
  shiftId: string;
  participationId: string;
  roleId: string;
  roleName: string;
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

export interface DashboardMinistryOption {
  id: string;
  name: string;
}

export interface VolunteerDashboard {
  availabilityTasks: DashboardAvailabilityTask[];
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  unreadNotificationCount: number;
  /** The caller's own latest member Notifications (User + Active Church). */
  notificationPreview: Notification[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
}

export interface MinistryScheduleRow {
  eventTimeBlockId: string;
  eventTimeBlockLabel: string;
  sectorName: string;
  roleName: string;
  volunteerDisplayName?: string;
  confirmationState: 'pending' | 'confirmed' | 'declined' | 'open';
}

export interface MinistryScheduleEvent {
  eventId: string;
  title: string;
  start: string;
  end: string;
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
  cycleId: string;
  cycleName: string;
  ministryId: string;
  ministryName: string;
  state: AvailabilityCheckState;
  confirmedAt?: Instant;
  totalShiftCount: number;
  unavailableShiftCount: number;
}

export interface VolunteerCheckShift {
  shiftId: string;
  eventId: string;
  eventTitle: string;
  startTime: Instant;
  endTime: Instant;
  label?: string;
  available: boolean;
}

export interface VolunteerAvailabilityCheckDetail {
  id: string;
  cycleId: string;
  cycleName: string;
  ministryId: string;
  ministryName: string;
  state: AvailabilityCheckState;
  confirmedAt?: Instant;
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

export interface SetUnavailableShiftsInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
  shiftIds: ShiftId[];
  /** Church-local dates (`yyyy-MM-dd`); each expands to one unavailable shift per shift on that date. */
  wholeDayDates?: string[];
}

export interface ConfirmAvailabilityCheckInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface ConfirmAvailabilityCheckResult {
  state: AvailabilityCheckState;
  confirmedAt: Instant;
}

export interface RespondToAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  reason?: string;
  response: 'accepted' | 'declined';
  volunteerId: VolunteerId;
}

export interface CancelOwnAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  volunteerId: VolunteerId;
}

export interface GetDashboardInput {
  userId: UserId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetUpcomingAssignmentsInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetPublishedScheduleInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetMinistryScheduleInput {
  ministryId: MinistryId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface IVolunteerManager {
  getDashboard(input: GetDashboardInput): Promise<VolunteerDashboard>;
  getUpcomingAssignments(
    input: GetUpcomingAssignmentsInput,
  ): Promise<Assignment[]>;
  getPublishedSchedule(input: GetPublishedScheduleInput): Promise<Assignment[]>;
  getMinistrySchedule(
    input: GetMinistryScheduleInput,
  ): Promise<MinistrySchedule>;
  listAvailabilityChecks(
    input: ListAvailabilityChecksInput,
  ): Promise<VolunteerAvailabilityCheckSummary[]>;
  getAvailabilityCheck(
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  setUnavailableShifts(
    input: SetUnavailableShiftsInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  confirmAvailabilityCheck(
    input: ConfirmAvailabilityCheckInput,
  ): Promise<ConfirmAvailabilityCheckResult>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  cancelOwnAssignment(input: CancelOwnAssignmentInput): Promise<void>;
}
