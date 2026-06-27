import type {
  AssignParams,
  ScheduleBuilderData,
  useScheduleBuilder,
} from '../../hooks/use-schedule-builder';
import type { ConflictStatus } from './assignment-chip';
import type { PickerVolunteer } from './assignment-picker';
import type { SlotEditValues } from './slot-edit-modal';

export interface UseScheduleBuilderControllerParams {
  builderData: ScheduleBuilderData;
  eventId: string;
  format: (date: Date | string | number, formatStr?: string) => string;
  invalidate: ReturnType<typeof useScheduleBuilder>['invalidate'];
  refetch: ReturnType<typeof useScheduleBuilder>['refetch'];
  createAssignment: ReturnType<typeof useScheduleBuilder>['createAssignment'];
  deleteAssignment: ReturnType<typeof useScheduleBuilder>['deleteAssignment'];
  publishEvent: ReturnType<typeof useScheduleBuilder>['publishEvent'];
}

export interface OverrideState {
  slotId: string;
  roleId: string;
  volunteerId: string;
  volunteerName: string;
  conflictType: ConflictStatus;
  slotLabel: string;
}

export interface SubstitutionState {
  declinedAssignmentId: string;
  declinedVolunteerId: string;
  declinedVolunteerName: string;
  roleId: string;
}

export interface SlotModalState {
  mode: 'create' | 'edit';
  slotId?: string;
  initial?: SlotEditValues;
}

export interface DeleteSlotState {
  slotId: string;
  assignmentCount: number;
}

export interface SidebarVolunteer {
  volunteerId: string;
  volunteerName: string;
  status: 'available' | 'partial' | 'unavailable' | 'no_response';
  conflictReason?: string;
}

export type AssignHandler = (params: AssignParams) => Promise<void>;
export type PickerVolunteerList = PickerVolunteer[];
