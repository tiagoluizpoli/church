import type {
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

export type PlanningCycleSummary = ListPlanningCycles200CyclesItem;
export type PlanningTemplateSummary = ListEventTemplates200TemplatesItem;
export type SelectedPlanningCycle = GetPlanningCycle200Cycle;
export type PlanningCycleEventGroup = GetPlanningCycle200EventsItem;
