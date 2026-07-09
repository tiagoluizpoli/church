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

export interface PlanningCyclesTableRow {
  id: string;
  name: string;
  window: string;
  state: PlanningCycleSummary['state'];
}

export interface TemplateLibraryTableRow {
  id: string;
  name: string;
  weekday: string;
  blockCount: number;
}

export interface CycleCalendarSlotRow {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  isOnlySlotInEvent: boolean;
}

export interface CycleCalendarTableRow {
  eventId: string;
  title: string;
  startDate: string;
  eventType: string;
  status: PlanningCycleEventGroup['event']['status'];
  slots: CycleCalendarSlotRow[];
}

export interface ExpandedCalendarRowsState {
  expandedEventIds: ReadonlySet<string>;
}

export interface EditingEventState {
  eventId: string;
  title: string;
  description: string;
  location: string;
  startDateTimeLocal: string;
  originalStartDate: string;
  originalEndDate: string;
}

export interface EditingSlotState {
  eventId: string;
  slotId: string;
  label: string;
  startTimeLocal: string;
  endTimeLocal: string;
  isMultiDayEvent: boolean;
}

export interface CreatingSlotState {
  eventId: string;
  label: string;
  startTimeLocal: string;
  endTimeLocal: string;
  isMultiDayEvent: boolean;
}
