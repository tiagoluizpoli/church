import type {
  ChurchId,
  EventId,
  EventTemplateId,
  PlanningCycleId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';

export interface GeneratePlanningTemplatesInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  templateIds: EventTemplateId[];
}

export interface GeneratedPlanningCounts {
  generatedEventCount: number;
  generatedSlotCount: number;
}

export interface CreatePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  eventType?: 'hourly' | 'day_based';
}

export interface UpdatePlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
  title?: string;
  description?: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CancelPlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
}

export interface IPlanningEventManager {
  generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts>;
  createEvent(input: CreatePlanningEventManagerInput): Promise<Event>;
  updateEvent(input: UpdatePlanningEventManagerInput): Promise<Event>;
  cancelEvent(input: CancelPlanningEventManagerInput): Promise<void>;
}
