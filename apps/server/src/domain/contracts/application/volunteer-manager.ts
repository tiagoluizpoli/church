import type { CalendarDay, Instant } from '@church/time';
import type {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { AvailabilityCheckState } from '../../entities/availability-check';
import type { Notification } from '../../entities/notification';

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
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  unreadNotificationCount: number;
  /** The caller's own latest member Notifications (User + Active Church). */
  notificationPreview: Notification[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
}

export interface VolunteerScheduleAssignment {
  assignmentId: string;
  eventId: string;
  eventTitle: string;
  shiftId: string;
  startTime: Instant;
  endTime: Instant;
  ministryId: string;
  ministryName: string;
  sectorName: string;
  roleId: string;
  roleName: string;
  status: 'pending' | 'confirmed' | 'declined';
}

/** One Ministry's part of one sent Cycle, published. */
export interface VolunteerPublishedScheduleSummary {
  ministryId: string;
  ministryName: string;
  cycleId: string;
  cycleName: string;
}

export interface VolunteerPublishedSchedule {
  assignments: VolunteerScheduleAssignment[];
  schedules: VolunteerPublishedScheduleSummary[];
}

export interface MinistryScheduleRow {
  shiftId: string;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  sectorName: string;
  roleName: string;
  /** Absent for an unfilled place ('Open'). */
  volunteerDisplayName?: string;
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
  cycleId: string;
  cycleName: string;
  published: boolean;
  events: MinistryScheduleEvent[];
}

export interface AssignmentRosterGroup {
  sectorName: string;
  roleName: string;
  people: { name: string; isYou: boolean }[];
  openCount: number;
}

export interface AssignmentDetail {
  assignmentId: string;
  eventId: string;
  eventTitle: string;
  startTime: Instant;
  endTime: Instant;
  cycleId: string;
  ministryId: string;
  ministryName: string;
  sectorName: string;
  roleName: string;
  leaderName: string | null;
  roster: AssignmentRosterGroup[];
}

export interface GetAssignmentDetailInput {
  assignmentId: AssignmentId;
  userId: UserId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface VolunteerAvailabilityCheckSummary {
  answerBy: CalendarDay | null;
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
  published: boolean;
  shiftId: string;
  eventId: string;
  eventTitle: string;
  startTime: Instant;
  endTime: Instant;
  label?: string;
  available: boolean;
}

export interface VolunteerAvailabilityCheckDetail {
  answerBy: CalendarDay | null;
  readOnly: boolean;
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

export interface AnswerAvailabilityCheckInput {
  checkId: AvailabilityCheckId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
  shiftIds: ShiftId[];
  /** Church-local dates (`yyyy-MM-dd`); each expands to one unavailable shift per shift on that date. */
  wholeDayDates?: string[];
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

export interface GetPublishedScheduleInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface GetMinistryScheduleInput {
  ministryId: MinistryId;
  cycleId: CycleId;
  volunteerId: VolunteerId;
  churchId: ChurchId;
}

export interface IVolunteerManager {
  getDashboard(input: GetDashboardInput): Promise<VolunteerDashboard>;
  getPublishedSchedule(
    input: GetPublishedScheduleInput,
  ): Promise<VolunteerPublishedSchedule>;
  getMinistrySchedule(
    input: GetMinistryScheduleInput,
  ): Promise<MinistrySchedule>;
  getAssignmentDetail(
    input: GetAssignmentDetailInput,
  ): Promise<AssignmentDetail>;
  listAvailabilityChecks(
    input: ListAvailabilityChecksInput,
  ): Promise<VolunteerAvailabilityCheckSummary[]>;
  getAvailabilityCheck(
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  answerAvailabilityCheck(
    input: AnswerAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  cancelOwnAssignment(input: CancelOwnAssignmentInput): Promise<void>;
}
