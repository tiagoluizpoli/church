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

export interface CreatePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
}

export interface UpdatePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  title?: string;
  description?: string;
  location?: string;
  start?: Date;
  end?: Date;
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
  createEvent(input: CreatePlanningEventManagerInput): Promise<Event>;
  updateEvent(input: UpdatePlanningEventManagerInput): Promise<Event>;
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
