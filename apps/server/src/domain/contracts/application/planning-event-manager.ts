import type {
  ChurchId,
  EventId,
  EventTemplateId,
  PlanningCycleId,
  TimeSlotId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';
import type { TimeSlot } from '../../entities/time-slot';

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
  /**
   * The supplied ISO date parts came from a calendar-date picker. They must
   * be interpreted in the church timezone rather than as UTC instants.
   */
  datesRepresentChurchCalendarDays?: boolean;
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

export interface CreatePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdatePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
  slotId: TimeSlotId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface DeletePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
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
