import type {
  CreatePlanningEventBody,
  GetPlanningCycle200Cycle,
  GetPlanningCycle200EventsItem,
  ListEventTemplates200TemplatesItem,
  ListPlanningCycles200CyclesItem,
} from '@/infrastructure/api/churchAPI.schemas';

export interface CycleFormState {
  name: string;
  startDate: string;
  endDate: string;
}

export interface TemplateBlockDraft {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}

export interface TemplateFormState {
  name: string;
  weekday: string;
  blocks: TemplateBlockDraft[];
}

export const PLANNING_EVENT_TYPES = ['day_based', 'hourly'] as const;

export type PlanningEventType = (typeof PLANNING_EVENT_TYPES)[number];

export interface PlanningEventFormState {
  title: string;
  startDateTime: string;
  endDateTime: string;
  eventType: PlanningEventType;
}

export interface CreatePlanningEventMutationInput {
  cycleId: string;
  body: CreatePlanningEventBody;
}

export type PlanningCycleSummary = ListPlanningCycles200CyclesItem;
export type PlanningTemplateSummary = ListEventTemplates200TemplatesItem;
export type SelectedPlanningCycle = GetPlanningCycle200Cycle;
export type PlanningCycleEventGroup = GetPlanningCycle200EventsItem;
