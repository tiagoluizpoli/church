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
import type { CheckDayState } from '../../services/availability-check-days';

export interface DashboardAssignmentItem {
  assignmentId: string;
  eventTimeBlockId: string;
  shiftId: string;
  participationId: string;
  roleId: string;
  roleName: string;
  sectorName: string;
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

export interface DashboardNextAssignment extends DashboardAssignmentItem {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
}

/** Published, non-declined Assignments whose Shift starts in one Church month. */
export interface DashboardServingMonth {
  /** First day of the month. */
  month: CalendarDay;
  served: number;
}

export interface VolunteerDashboard {
  nextAssignment: DashboardNextAssignment | null;
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  unreadNotificationCount: number;
  /** The caller's own latest member Notifications (User + Active Church). */
  notificationPreview: Notification[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
  /** The latest months up to the Church's current one, oldest first. */
  servingHistory: DashboardServingMonth[];
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
  /** An open Swap request on a not-yet-started Shift. */
  swapRequested: boolean;
}

/** One Ministry's part of one sent Cycle, published. */
export interface VolunteerPublishedScheduleSummary {
  ministryId: string;
  ministryName: string;
  cycleId: string;
  cycleName: string;
}

/** Counts over the listed Assignments, for the page header. */
export interface VolunteerScheduleCounts {
  upcoming: number;
  /** Starting in the current calendar month in the Church Timezone. */
  thisMonth: number;
  openSwaps: number;
}

/** What the filters can choose from, over the whole unfiltered list. */
export interface VolunteerScheduleFilterOptions {
  /** `yyyy-MM` months, in the Church Timezone, with at least one Assignment; ascending. */
  months: string[];
  /** The Ministries the Volunteer serves in, by name. */
  ministries: { id: string; name: string }[];
}

export interface VolunteerPublishedSchedule {
  /** Filtered by `filters`; everything else ignores them. */
  assignments: VolunteerScheduleAssignment[];
  schedules: VolunteerPublishedScheduleSummary[];
  counts: VolunteerScheduleCounts;
  /** The soonest listed Assignment, whatever the filters. */
  next: VolunteerScheduleAssignment | null;
  options: VolunteerScheduleFilterOptions;
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
  /** The caller's own latest Swap request on this Assignment; null is "none". */
  swapRequest: {
    id: string;
    /** `open` past the Shift's start already reads as `expired`. */
    status: 'open' | 'withdrawn' | 'covered' | 'kept' | 'expired';
    note: string | null;
    reply: string | null;
    raisedAt: Instant;
  } | null;
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
  /** Answerable Shifts only: unpublished and not yet ended. */
  totalShiftCount: number;
  unavailableShiftCount: number;
}

export interface VolunteerCheckShift {
  published: boolean;
  /** On the published schedule for this Shift. */
  assigned: boolean;
  shiftId: string;
  eventId: string;
  eventTitle: string;
  startTime: Instant;
  endTime: Instant;
  label?: string;
  available: boolean;
  /** The Volunteer can still change this answer: open check, unpublished and not ended. */
  answerable: boolean;
}

export interface VolunteerCheckDay {
  /** Church-local day the Shifts start on. */
  date: CalendarDay;
  state: CheckDayState;
  shifts: VolunteerCheckShift[];
}

export interface VolunteerAvailabilityCheckCounts {
  openDays: number;
  pastDays: number;
  publishedDays: number;
  openShifts: number;
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
  /** Ascending date; Shifts inside keep their start-time order. */
  days: VolunteerCheckDay[];
  counts: VolunteerAvailabilityCheckCounts;
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

export interface VolunteerScheduleFilters {
  /** Case-insensitive literal substring of the Event title. */
  search?: string;
  /** `yyyy-MM`, matched on the Shift start's Church-Timezone day. */
  month?: string;
  ministryId?: string;
}

export interface GetPublishedScheduleInput {
  volunteerId: VolunteerId;
  churchId: ChurchId;
  filters?: VolunteerScheduleFilters;
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
