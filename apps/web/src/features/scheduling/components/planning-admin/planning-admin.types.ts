import type { Instant, TimeOfDay } from '@church/time';
import type {
  GetCycle200Cycle,
  GetCycle200EventsItem,
  ListCycles200CyclesItem,
  ListEventTemplates200TemplatesItem,
} from '@/infrastructure/api/churchAPI.schemas';

export interface CycleFormState {
  name: string;
  startDate: string;
  endDate: string;
}

export interface TemplateBlockDraft {
  id: string;
  label: string;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
}

export interface TemplateFormState {
  name: string;
  weekday: string;
  blocks: TemplateBlockDraft[];
}

export type CycleSummary = ListCycles200CyclesItem;
export type PlanningTemplateSummary = ListEventTemplates200TemplatesItem;
export type SelectedCycle = GetCycle200Cycle;
export type CycleEventGroup = GetCycle200EventsItem;

export interface CyclesTableRow {
  id: string;
  name: string;
  window: string;
  state: CycleSummary['state'];
}

export interface TemplateLibraryTableRow {
  id: string;
  name: string;
  weekday: string;
  blockCount: number;
  description: string;
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
  start: string;
  end: string;
  status: CycleEventGroup['event']['status'];
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
  start: Instant;
  originalStart: string;
  originalEnd: string;
}

export interface EditingSlotState {
  eventId: string;
  slotId: string;
  label: string;
  start: Instant;
  end: Instant;
  isMultiDayEvent: boolean;
}

export interface CreatingSlotState {
  eventId: string;
  label: string;
  start: Instant;
  end: Instant;
  isMultiDayEvent: boolean;
}
