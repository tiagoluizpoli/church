import type { Instant } from '@church/time';
import type {
  AssignmentId,
  EventId,
  RoleId,
  SectorId,
  ShiftId,
} from './branded-ids';

/** Facts communicated about one Assignment, frozen for later net comparisons. */
export interface ScheduleAssignmentSnapshot {
  assignmentId: AssignmentId;
  shiftId: ShiftId;
  eventId: EventId;
  eventTitle: string;
  eventStart: Instant;
  eventEnd: Instant;
  startsAt: Instant;
  endsAt: Instant;
  roleId: RoleId;
  roleName: string;
  sectorId: SectorId;
  sectorName: string;
  swapRequestCovered?: boolean;
}
