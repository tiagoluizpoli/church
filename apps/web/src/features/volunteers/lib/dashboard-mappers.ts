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

export interface DashboardMinistryScheduleRow {
  eventTimeBlockId: string;
  eventTimeBlockLabel: string;
  sectorName: string;
  roleName: string;
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

import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';

export interface DashboardSnapshot {
  upcomingAssignmentGroups: DashboardAssignmentGroup[];
  notificationUnreadCount: number;
  /** The caller's own latest member Notifications. */
  notificationPreview: GetNotifications200ItemsItem[];
  defaultMinistryId?: string;
  ministryOptions: DashboardMinistryOption[];
  fetchedAt: string;
}
