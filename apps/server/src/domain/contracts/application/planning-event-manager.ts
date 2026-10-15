import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  TimeSlotId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';
import type { TimeSlot } from '../../entities/time-slot';

export interface GeneratePlanningTemplatesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  templateIds: EventTemplateId[];
}

export interface GeneratedPlanningCounts {
  generatedEventCount: number;
  generatedSlotCount: number;
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

export interface CreatePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdatePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  slotId: TimeSlotId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface DeletePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
  slotId: TimeSlotId;
}

export interface IPlanningEventManager {
  generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts>;
  createEvent(input: CreatePlanningEventManagerInput): Promise<Event>;
  updateEvent(input: UpdatePlanningEventManagerInput): Promise<Event>;
  cancelEvent(input: CancelPlanningEventManagerInput): Promise<void>;
  createSlot(input: CreatePlanningEventSlotManagerInput): Promise<TimeSlot>;
  updateSlot(input: UpdatePlanningEventSlotManagerInput): Promise<TimeSlot>;
  deleteSlot(input: DeletePlanningEventSlotManagerInput): Promise<void>;
}
