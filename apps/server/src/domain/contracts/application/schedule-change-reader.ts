import type { Instant } from '@church/time';
import type { ChurchId, MinistryId, VolunteerId } from '../../branded-ids';
import type { EventWithEventTimeBlocks } from '../../entities/event';
import type { MinistryParticipation } from '../../entities/ministry-participation';
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
  readParticipationCompletion(
    input: ReadParticipationCompletionInput,
  ): Promise<ParticipationCompletionView>;
  compareScheduleAssignments(
    input: CompareScheduleAssignmentsInput,
  ): ScheduleVolunteerChanges[];
}
