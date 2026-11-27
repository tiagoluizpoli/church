import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  UserId,
} from '../../branded-ids';
import type { Church } from '../../entities/church';
import type { Cycle } from '../../entities/cycle';
import type { Event } from '../../entities/event';
import type { EventTemplate } from '../../entities/event-template';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type {
  CancellationImpact,
  CancellationScope,
  CancellationScopeAssignment,
  ResolvedCancellationScope,
} from '../../services/event-cancellation';
import type { EditProposal } from '../../services/event-edit';
import type { EventGraphTimeBlock } from '../../services/event-graph';
import type {
  InstantBounds,
  MoveClash,
  MoveProposal,
  MoveScope,
  MoveScopeAssignment,
} from '../../services/event-move';
import type { LosingEventTimeBlock } from '../../services/template-precedence-application';
import type { IAssignmentLifecycle } from './assignment-lifecycle';
import type { IChurchNotifications } from './church-notifications';
import type { IChurchRecipients } from './church-recipients';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type {
  PlanningEventRepository,
  SeededMinistry,
} from '@/domain/contracts/infrastructure/planning-event.repository';
import type { TemplatePrecedenceRepository } from '@/domain/contracts/infrastructure/template-precedence.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface GeneratePlanningTemplatesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  templateIds: EventTemplateId[];
}

export interface GeneratedPlanningCounts {
  generatedEventCount: number;
  generatedEventTimeBlockCount: number;
  /** Existing blocks a Template Precedence now makes losers; Apply deletes none. */
  leftoverEventTimeBlocks: LosingEventTimeBlock[];
}

/** One Time block of a complete Event create. */
export interface PlanningEventTimeBlockDraft {
  label: string;
  startTime: Date;
  endTime: Date;
  /** Absent keeps a retained block's value; a new block starts private. */
  isPublic?: boolean;
  /** Empty clears; absent keeps a retained block's value. */
  place?: string;
  /** A Church Address as the place; sent with `place`, both set the place together. */
  placeAddressId?: string | null;
}

/** A Draft Event with every one of its Time blocks, saved together. */
export interface CreatePlanningEventManagerInput {
  churchId: ChurchId;
  /** The acting ChurchAdmin, named in the N10 add Notification. */
  actingUserId: UserId;
  cycleId: CycleId;
  title: string;
  location?: string;
  start: Date;
  end: Date;
  eventTimeBlocks: PlanningEventTimeBlockDraft[];
}

/** An Event with its EventTimeBlocks, as a create or edit returns them. */
export interface PlanningEventGraph {
  event: Event;
  eventTimeBlocks: EventTimeBlock[];
}

/** One Time block of a complete Event edit; `id` names a retained block. */
export interface PlanningEventTimeBlockEdit
  extends PlanningEventTimeBlockDraft {
  id?: EventTimeBlockId;
}

/**
 * The complete desired Draft Event: retained ids update in place, blocks
 * without an id are created and omitted persisted blocks are deleted.
 */
export interface UpdatePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  title: string;
  location?: string;
  start: Date;
  end: Date;
  eventTimeBlocks: PlanningEventTimeBlockEdit[];
}

/** Title and location of a Sent Event; nothing else in the graph changes. */
export interface UpdatePlanningEventDetailsManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  title: string;
  location?: string;
  /** Público and place of existing blocks; omitted blocks stay as they are. */
  eventTimeBlocks?: {
    id: EventTimeBlockId;
    isPublic: boolean;
    place?: string;
    placeAddressId?: string | null;
  }[];
}

export interface DeletePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
}

export interface CreatePlanningEventTimeBlockManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdatePlanningEventTimeBlockManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  eventTimeBlockId: EventTimeBlockId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface DeletePlanningEventTimeBlockManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  eventTimeBlockId: EventTimeBlockId;
}

/**
 * A move request for one scope: the whole Event or one EventTimeBlock.
 * Preview now, confirm later and the block endpoints all take this shape.
 */
export interface PlanningMoveManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  scope: MoveScope;
  /** The requested new start of the scope. */
  start: Date;
}

export type PreviewPlanningMoveManagerInput = PlanningMoveManagerInput;

/** The proposed bounds and the Assignments that would clash; nothing is written. */
export interface PlanningMovePreview {
  proposal: MoveProposal;
  clashes: MoveClash[];
}

export interface ConfirmPlanningMoveManagerInput
  extends PlanningMoveManagerInput {
  /** The ChurchAdmin who confirms; audits the withdrawals. */
  actingUserId: UserId;
}

/** The moved graph and the clashing Assignments confirm actually withdrew. */
export interface PlanningMoveResult {
  graph: PlanningEventGraph;
  withdrawn: MoveClash[];
}

/** One block of an edit; `id` keeps that active block, none adds one. */
export interface PlanningEditTimeBlock {
  id?: EventTimeBlockId;
  label: string;
  startTime: Date;
  endTime: Date;
}

/** The complete proposed bounds and blocks of a scheduled Event of a Sent Cycle. */
export interface PreviewPlanningEditManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  start: Date;
  end: Date;
  eventTimeBlocks: PlanningEditTimeBlock[];
}

export interface ConfirmPlanningEditManagerInput
  extends PreviewPlanningEditManagerInput {
  /** The ChurchAdmin who confirms; audits the withdrawals. */
  actingUserId: UserId;
}

/** The proposed bounds and the Assignments a clash would withdraw; nothing is written. */
export interface PlanningEditPreview {
  proposal: EditProposal;
  clashes: MoveClash[];
}

/** A cancellation request for one scope: the whole Event or one EventTimeBlock. */
export interface PlanningCancellationManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  scope: CancellationScope;
}

export type PreviewPlanningCancellationManagerInput =
  PlanningCancellationManagerInput;

export interface ConfirmPlanningCancellationManagerInput
  extends PlanningCancellationManagerInput {
  /** The session's ChurchAdmin: audits the Assignments, closes the requests. */
  actingUserId: UserId;
  /** Hide the cancelled scope in the same transaction; absent: shown. */
  hidden?: boolean;
}

export interface SetPlanningHiddenManagerInput
  extends PlanningCancellationManagerInput {
  hidden: boolean;
}

export interface IPlanningEventManager {
  generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts>;
  createEvent(
    input: CreatePlanningEventManagerInput,
  ): Promise<PlanningEventGraph>;
  updateEvent(
    input: UpdatePlanningEventManagerInput,
  ): Promise<PlanningEventGraph>;
  updateEventDetails(
    input: UpdatePlanningEventDetailsManagerInput,
  ): Promise<PlanningEventGraph>;
  deleteEvent(input: DeletePlanningEventManagerInput): Promise<void>;
  createEventTimeBlock(
    input: CreatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock>;
  updateEventTimeBlock(
    input: UpdatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock>;
  deleteEventTimeBlock(
    input: DeletePlanningEventTimeBlockManagerInput,
  ): Promise<void>;
  /** Advisory and write-free: confirm recalculates and never trusts it. */
  previewMove(
    input: PreviewPlanningMoveManagerInput,
  ): Promise<PlanningMovePreview>;
  /**
   * Recalculates the move under the Church lock (shared with Assignment
   * creation), moves the scope and withdraws the clashing Assignments, all in
   * one transaction.
   */
  confirmMove(
    input: ConfirmPlanningMoveManagerInput,
  ): Promise<PlanningMoveResult>;
  /**
   * Advisory and write-free: allowed until the Event ends, the proposal
   * passes the final-graph rules and no staffed block is dropped.
   */
  previewEdit(
    input: PreviewPlanningEditManagerInput,
  ): Promise<PlanningEditPreview>;
  /**
   * Recalculates under the Church lock (never trusting a preview), withdraws
   * only the actual clashes, retimes the Event, its kept blocks and their
   * Shifts, adds the new blocks and cancels the dropped unstaffed ones.
   */
  confirmEdit(
    input: ConfirmPlanningEditManagerInput,
  ): Promise<PlanningMoveResult>;
  /** Advisory and write-free: confirm recalculates and never trusts it. */
  previewCancellation(
    input: PreviewPlanningCancellationManagerInput,
  ): Promise<CancellationImpact>;
  /**
   * Recalculates the impact under the Church and Event Participation locks,
   * then cancels the scope in one transaction: soft-cancels and audits its
   * active Assignments, closes their open SwapRequests as covered, deletes
   * its UnavailableShifts and drops its last-told entries. Returns the actual
   * impact.
   */
  confirmCancellation(
    input: ConfirmPlanningCancellationManagerInput,
  ): Promise<CancellationImpact>;
  /**
   * Hides or shows a cancelled Event or EventTimeBlock, in any Cycle state and
   * at any time; enqueues nothing. Refuses a scope that is not itself
   * cancelled (ILLEGAL_STATE_TRANSITION).
   */
  setHidden(input: SetPlanningHiddenManagerInput): Promise<void>;
}

export interface ComputeMoveInput {
  input: PlanningMoveManagerInput;
  church: Church;
  tx: TransactionContext;
}

/** The move computation with the facts confirm and N10 also need. */
export interface ComputedMove extends PlanningMovePreview {
  cycle: Cycle;
  event: Event;
  scopeAssignments: MoveScopeAssignment[];
}

export interface ComputeEditInput {
  input: PreviewPlanningEditManagerInput;
  church: Church;
  tx: TransactionContext;
}

export interface ComputedEdit extends PlanningEditPreview {
  cycle: Cycle;
  event: Event;
  eventTimeBlocks: EventTimeBlock[];
  scopeAssignments: MoveScopeAssignment[];
  /** The one instant preview and apply judge started Shifts by. */
  now: Instant;
}

export interface ComputeCancellationInput {
  input: PlanningCancellationManagerInput;
  church: Church;
  tx: TransactionContext;
}

/** The cancellation computation with the facts confirm (and N9/N10) need. */
export interface ComputedCancellation {
  impact: CancellationImpact;
  cycle: Cycle;
  event: Event;
  resolved: ResolvedCancellationScope;
  scopeAssignments: CancellationScopeAssignment[];
}

export interface EnqueueEventCancelledInput {
  actingUserId: UserId;
  church: Church;
  computed: ComputedCancellation;
  tx: TransactionContext;
}

export interface EnqueueEventMovedInput {
  actingUserId: UserId;
  church: Church;
  cycle: Cycle;
  event: Event;
  /** The scope's active Assignments before any withdrawal. */
  scopeAssignments: MoveScopeAssignment[];
  /** The changed blocks: their Ministries are told. */
  eventTimeBlockIds: EventTimeBlockId[];
  previous: InstantBounds;
  proposed: InstantBounds;
  tx: TransactionContext;
}

export interface EnsureCycleWritableInput {
  cycle: Cycle;
  churchTimeZone: string;
  /** The write's open transaction, so its rollback undoes the Past flip. */
  tx: TransactionContext;
}

/**
 * Actions that can be attempted against an event/event time block while checking
 * whether the owning cycle still allows writes. Used only inside
 * `DbPlanningEventManager`; `IPlanningEventManager` has no concept of it.
 */
export type WritableEntityAction = 'update' | 'delete';

export interface EnsureWritableEventInput {
  input:
    | CreatePlanningEventTimeBlockManagerInput
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

export interface GetCycleEventInput {
  input:
    | EnsureWritableEventInput['input']
    | UpdatePlanningEventManagerInput
    | UpdatePlanningEventDetailsManagerInput
    | DeletePlanningEventManagerInput
    | PlanningCancellationManagerInput;
  tx: TransactionContext;
}

/** The Cycle and Event a single-block write runs under. */
export interface WritableEvent {
  cycle: Cycle;
  event: Event;
}

export interface WritableEventTimeBlock extends WritableEvent {
  eventTimeBlock: EventTimeBlock;
}

export interface AssertBlockGraphInput extends WritableEvent {
  churchId: ChurchId;
  timeZone: string;
  /** The created or updated block, as it would be saved. */
  block: EventGraphTimeBlock;
  tx: TransactionContext;
}

export interface LoadWritableEventTimeBlockInput {
  input:
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

export interface EnqueueEventAddedInput {
  churchId: ChurchId;
  actingUserId: UserId;
  church: Church;
  cycle: Cycle;
  event: Event;
  ministries: SeededMinistry[];
  tx: TransactionContext;
}

export interface LoadPrecedencePairsInput {
  churchId: ChurchId;
  selected: EventTemplate[];
  tx: TransactionContext;
}

export interface DbPlanningEventManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  templateRepository: EventTemplateRepository;
  precedenceRepository: TemplatePrecedenceRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  eventTimeBlockRepository: EventTimeBlockRepository;
  assignmentLifecycle: IAssignmentLifecycle;
  recipients: IChurchRecipients;
  notifications: IChurchNotifications;
}

export interface ListInOrderInput {
  churchId: ChurchId;
  eventId: EventId;
  blockIds: EventTimeBlockId[];
  tx: TransactionContext;
}

export interface ChangedPublicFieldsInput {
  block: EventTimeBlock;
  isPublic?: boolean;
  /** Empty clears; absent keeps (with `placeAddressId` absent too). */
  place?: string;
  /** Null or absent with `place` given means no address. */
  placeAddressId?: string | null;
}

export interface PublicFieldsPatch {
  isPublic?: boolean;
  place?: string | null;
  placeAddressId?: string | null;
}
