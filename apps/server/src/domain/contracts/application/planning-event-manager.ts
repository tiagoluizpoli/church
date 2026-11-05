import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';

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

export interface CancelPlanningEventManagerInput {
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
}
