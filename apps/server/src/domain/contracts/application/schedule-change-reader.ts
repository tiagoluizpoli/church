import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Event, EventWithEventTimeBlocks } from '../../entities/event';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Role } from '../../entities/role';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type { ScheduleChange } from '../../schedule-changes';
import type { ScheduleAssignmentSnapshot } from '../../schedule-last-told';
import type { GetCycleBuilderDataInput } from './schedule-builder-reader';
import type {
  GetParticipationCompletionInput,
  ParticipationCompletionView,
} from './schedule-read-model';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type {
  MinistryParticipationRepository,
  ScheduleLastToldRow,
} from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/** One Volunteer whose told Schedule differs from the current one. */
export interface ScheduleVolunteerChanges {
  id: VolunteerId;
  changes: ScheduleChange[];
}

export interface CompareScheduleAssignmentsInput {
  events: EventWithEventTimeBlocks[];
  baseline: ScheduleLastToldRow[];
  current: Map<VolunteerId, ScheduleAssignmentSnapshot[]>;
  at: Instant;
}

export interface ReadParticipationCompletionInput {
  churchId: GetParticipationCompletionInput['churchId'];
  participationId: GetParticipationCompletionInput['participationId'];
  tx?: TransactionContext;
}

export interface ParticipationStaffingView extends ParticipationCompletionView {
  /** Places no active Assignment covers, counted per requirement. */
  gapCount: number;
}

export interface ScheduleScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: GetCycleBuilderDataInput['cycleId'];
}

export interface CountScheduleChangesInput extends ScheduleScopeInput {
  tx: TransactionContext;
}

export interface CollectScheduleAssignmentsInput {
  input: ScheduleScopeInput;
  participations: MinistryParticipation[];
  events: EventWithEventTimeBlocks[];
  tx: TransactionContext;
}

/** One Schedule, named by its Ministry and Cycle. */
export interface ScheduleKey {
  ministryId: MinistryId;
  cycleId: CycleId;
}

export interface CountScheduleChangesBySchedulesInput {
  churchId: ChurchId;
  schedules: ScheduleKey[];
  tx?: TransactionContext;
}

/** A published Schedule's count of Volunteers with untold changes. */
export interface ScheduleChangeCount extends ScheduleKey {
  count: number;
}

export interface CollectAssignmentSnapshotsInput {
  churchId: ChurchId;
  participations: MinistryParticipation[];
  events: Event[];
  tx?: TransactionContext;
}

/** One active Assignment's snapshot, with the participation and Volunteer it belongs to. */
export interface ParticipationAssignmentSnapshot {
  participationId: MinistryParticipationId;
  volunteerId: VolunteerId;
  snapshot: ScheduleAssignmentSnapshot;
}

/** The rows one active Assignment's snapshot is built from. */
export interface ToAssignmentSnapshotInput {
  assignment: Assignment;
  event: Event;
  shift: Shift | undefined;
  requirement: ShiftRequirement | undefined;
  role: Role;
}

export interface CompareLiveScheduleAssignmentsInput {
  cancelledEventIds: ReadonlySet<EventId>;
  /** Shifts of cancelled time blocks. */
  cancelledShiftIds: ReadonlySet<ShiftId>;
  baseline: ScheduleLastToldRow[];
  current: Map<VolunteerId, ScheduleAssignmentSnapshot[]>;
  at: Instant;
}

export interface DbScheduleChangeReaderDependencies {
  assignmentRepository: AssignmentRepository;
  eventRepository: PlanningEventRepository;
  participationRepository: MinistryParticipationRepository;
  roleRepository: RoleRepository;
  shiftRepository: ShiftRepository;
}

export interface IScheduleChangeReader {
  collectScheduleAssignments(
    input: CollectScheduleAssignmentsInput,
  ): Promise<Map<VolunteerId, ScheduleAssignmentSnapshot[]>>;
  /** Volunteers whose published Schedule changed since they were last told. */
  countScheduleChanges(input: CountScheduleChangesInput): Promise<number>;
  /**
   * `countScheduleChanges` for many Schedules at a fixed number of reads, each
   * Cycle read once. Only Schedules with a published participation on a live
   * Event are listed; any other Schedule's count is 0 and costs no read beyond
   * finding that out.
   */
  countScheduleChangesBySchedules(
    input: CountScheduleChangesBySchedulesInput,
  ): Promise<ScheduleChangeCount[]>;
  readParticipationCompletion(
    input: ReadParticipationCompletionInput,
  ): Promise<ParticipationStaffingView>;
  compareScheduleAssignments(
    input: CompareScheduleAssignmentsInput,
  ): ScheduleVolunteerChanges[];
}
