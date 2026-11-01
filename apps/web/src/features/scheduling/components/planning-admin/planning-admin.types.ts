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

/** One editable block row. `key` is a temporary React/row key; `persistedId`
 * is the stored TemplateTimeBlock id and exists only for blocks loaded for edit. */
export interface TemplateTimeBlockDraft {
  key: string;
  persistedId?: string;
  label: string;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
}

export interface TemplateFormState {
  name: string;
  weekday: string;
  blocks: TemplateTimeBlockDraft[];
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

export interface CycleCalendarEventTimeBlockRow {
  eventTimeBlockId: string;
  label: string;
  startTime: string;
  endTime: string;
  isOnlyEventTimeBlockInEvent: boolean;
}

export interface CycleCalendarTableRow {
  eventId: string;
  title: string;
  start: string;
  end: string;
  status: CycleEventGroup['event']['status'];
  eventTimeBlocks: CycleCalendarEventTimeBlockRow[];
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

export interface EditingEventTimeBlockState {
  eventId: string;
  eventTimeBlockId: string;
  label: string;
  start: Instant;
  end: Instant;
  isMultiDayEvent: boolean;
}

export interface CreatingEventTimeBlockState {
  eventId: string;
  label: string;
  start: Instant;
  end: Instant;
  isMultiDayEvent: boolean;
}
