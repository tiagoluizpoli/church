import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  MinistryId,
  TemplateTimeBlockId,
  VolunteerId,
} from '../../branded-ids';
import type {
  Event,
  EventStatus,
  EventWithEventTimeBlocks,
} from '../../entities/event';
import type {
  MoveClashCandidate,
  MoveScopeAssignment,
} from '../../services/event-move';
import type { TransactionContext } from './transaction-context';

export interface CreatePlanningEventInput {
  churchId: ChurchId;
  cycleId: CycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  status: EventStatus;
  tx?: TransactionContext;
}

export interface UpdatePlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  title?: string;
  description?: string;
  /** `null` clears the location. */
  location?: string | null;
  start?: Date;
  end?: Date;
  status?: EventStatus;
  tx?: TransactionContext;
}

export interface GetPlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface DeletePlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListCycleEventsInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface CreatePlanningEventTimeBlockInput {
  churchId: ChurchId;
  eventId: EventId;
  sourceTemplateTimeBlockId?: TemplateTimeBlockId;
  startTime: Date;
  endTime: Date;
  label?: string;
  tx?: TransactionContext;
}

/** A Ministry that received a participation scaffold. */
export interface SeededMinistry {
  id: MinistryId;
  name: string;
}

export interface SeedPlanningParticipationsInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListMoveScopeAssignmentsInput {
  churchId: ChurchId;
  eventId: EventId;
  /** Only this EventTimeBlock's Assignments; absent for the whole Event. */
  eventTimeBlockId?: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface ListMoveClashCandidatesInput {
  churchId: ChurchId;
  volunteerIds: VolunteerId[];
  /** The whole moved scope: its Assignments are never their own candidates. */
  excludedEventTimeBlockIds: EventTimeBlockId[];
  /** Only Shifts strictly overlapping `[startTime, endTime)` are returned. */
  startTime: Date;
  endTime: Date;
  tx?: TransactionContext;
}

export interface LockEventParticipationsInput {
  churchId: ChurchId;
  eventId: EventId;
  tx: TransactionContext;
}

export interface ListMoveAffectedMinistriesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  /** The moved blocks; a Ministry is affected when it opted into or staffs one. */
  eventTimeBlockIds: EventTimeBlockId[];
  tx: TransactionContext;
}

export interface MoveAffectedMinistry {
  id: MinistryId;
  name: string;
  /** A confirmed availability answer of the Ministry exists in the Cycle. */
  answersGiven: boolean;
}

export interface MoveEventTimeBlocksInput {
  churchId: ChurchId;
  eventTimeBlockIds: EventTimeBlockId[];
  /** Added to each block's and each of its Shifts' start and end. */
  deltaMs: number;
  tx: TransactionContext;
}

export interface PlanningEventRepository {
  createEvent(input: CreatePlanningEventInput): Promise<Event>;
  updateEvent(input: UpdatePlanningEventInput): Promise<Event>;
  getEvent(input: GetPlanningEventInput): Promise<Event>;
  /**
   * Hard-deletes an event row. The `event → eventTimeBlock → shift → assignment`
   * (and `assignment → assignmentAudit`) foreign keys all cascade, so event time blocks,
   * shifts, draft assignments and their audits go with it. Only ever called
   * for `draft` events — those never reached `scheduled`, so no volunteer has
   * seen them (see BL-020 / issue #12).
   */
  deleteEvent(input: DeletePlanningEventInput): Promise<void>;
  listCycleEvents(
    input: ListCycleEventsInput,
  ): Promise<EventWithEventTimeBlocks[]>;
  createEventTimeBlock(
    input: CreatePlanningEventTimeBlockInput,
  ): Promise<EventTimeBlockId>;
  /**
   * One participation per active Ministry, at that Ministry's furthest-behind
   * stage in the Cycle (`preparing` when it has none yet). Returns those Ministries.
   */
  seedParticipations(
    input: SeedPlanningParticipationsInput,
  ): Promise<SeededMinistry[]>;
  /** The active Assignments (draft, pending, confirmed) on the move scope. */
  listMoveScopeAssignments(
    input: ListMoveScopeAssignmentsInput,
  ): Promise<MoveScopeAssignment[]>;
  /** Active Church Assignments of `volunteerIds` outside the scope, overlapping the window. */
  listMoveClashCandidates(
    input: ListMoveClashCandidatesInput,
  ): Promise<MoveClashCandidate[]>;
  /**
   * Row-locks (`FOR NO KEY UPDATE`, ascending id) the Event's
   * MinistryParticipations, the lock Assignment removal and preparation
   * saves take; needs `tx`.
   */
  lockParticipations(input: LockEventParticipationsInput): Promise<void>;
  /** Active Ministries opted into (or staffing) the moved blocks, by name. */
  listMoveAffectedMinistries(
    input: ListMoveAffectedMinistriesInput,
  ): Promise<MoveAffectedMinistry[]>;
  /** Shifts the blocks and all of their Shifts by one delta. */
  moveEventTimeBlocks(input: MoveEventTimeBlocksInput): Promise<void>;
}
