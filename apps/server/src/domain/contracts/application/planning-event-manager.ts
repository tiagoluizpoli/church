import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  UserId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type {
  MoveClash,
  MoveProposal,
  MoveScope,
} from '../../services/event-move';

export interface GeneratePlanningTemplatesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  templateIds: EventTemplateId[];
}

export interface GeneratedPlanningCounts {
  generatedEventCount: number;
  generatedEventTimeBlockCount: number;
}

/** One Time block of a complete Event create. */
export interface PlanningEventTimeBlockDraft {
  label: string;
  startTime: Date;
  endTime: Date;
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
}

export interface CancelPlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
}

export type DeletePlanningEventManagerInput = CancelPlanningEventManagerInput;

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
  cancelEvent(input: CancelPlanningEventManagerInput): Promise<void>;
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
}
