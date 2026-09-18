import type {
  AvailabilityEventViewModel,
  AvailabilitySlotViewModel,
} from '../components/availability-form';
import type { AvailabilityTaskViewModel } from '../components/availability-needed-section';
import { formatInstantOf } from '@/shared/utils/church-time';

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
  shiftId: string;
  participationId: string;
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

export interface DashboardMinistryScheduleRow {
  slotId: string;
  slotLabel: string;
  roleName: string;
  teamName?: string;
  volunteerDisplayName?: string;
  confirmationState: 'pending' | 'confirmed' | 'declined' | 'open';
}

export interface DashboardMinistryScheduleEvent {
  eventId: string;
  title: string;
  start: string;
  end: string;
  assignmentCount: number;
  rows: DashboardMinistryScheduleRow[];
}

export interface DashboardMinistrySchedule {
  ministryId: string;
  ministryName: string;
  events: DashboardMinistryScheduleEvent[];
}

export interface DashboardSnapshot {
  availabilityTasks: DashboardAvailabilityTask[];
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  notificationUnreadCount: number;
  notificationPreview: DashboardNotificationPreview[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
  fetchedAt: string;
}

export interface MapAvailabilityTaskInput {
  task: DashboardAvailabilityTask;
  timeZone: string;
}

export function mapAvailabilityTask({
  task,
  timeZone,
}: MapAvailabilityTaskInput): AvailabilityTaskViewModel {
  return {
    eventId: task.eventId,
    eventTitle: task.eventTitle,
    ministryName: task.ministryName,
    eventType: task.eventType,
    eventStartLabel: formatInstantOf({ value: task.eventStart, timeZone }),
    eventEndLabel: formatInstantOf({ value: task.eventEnd, timeZone }),
    completionState: task.completionState,
  };
}

export function mapAvailabilityEvent(
  task: DashboardAvailabilityTask,
): AvailabilityEventViewModel {
  return {
    id: task.eventId,
    title: task.eventTitle,
    eventType: task.eventType,
    start: task.eventStart,
    end: task.eventEnd,
  };
}

export function mapAvailabilitySlots(
  data:
    | {
        slots: AvailabilitySlotViewModel[];
      }
    | undefined,
): AvailabilitySlotViewModel[] {
  return data?.slots ?? [];
}
