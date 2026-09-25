import {
  addMilliseconds,
  type Instant,
  millisecondsBetween,
  parseInstant,
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDaySpan,
} from '@church/time';
import { isAxiosError } from 'axios';
import type {
  CycleCalendarSlotRow,
  CycleCalendarTableRow,
  CycleFormState,
  PlanningCycleEventGroup,
  PlanningCycleSummary,
  PlanningCyclesTableRow,
  PlanningTemplateSummary,
  SelectedPlanningCycle,
  TemplateBlockDraft,
  TemplateFormState,
  TemplateLibraryTableRow,
} from './planning-admin.types';
import type {
  CreateEventTemplateBody,
  GetPlanningCycle200EventsItemEventStatus,
  ListPlanningCycles200CyclesItemState,
} from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { describeSpan } from '@/shared/utils/span-description';

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

let templateBlockDraftCounter = 0;

interface FormatDateInput {
  date: string;
}

interface DescribeTemplateInput {
  template: PlanningTemplateSummary;
}

interface TemplateFormFromTemplateInput {
  template: PlanningTemplateSummary;
}

interface ErrorMessageInput {
  error: unknown;
}

interface ForbiddenErrorInput {
  error: unknown;
}

interface SelectedCycleIdInput {
  selectedCycleId: string | null;
}

interface SortTemplateBlocksInput {
  blocks: TemplateBlockDraft[];
}

interface CycleStateVariantInput {
  state: ListPlanningCycles200CyclesItemState;
}

interface EventStatusVariantInput {
  status: GetPlanningCycle200EventsItemEventStatus;
}

interface TotalSlotsInput {
  events: PlanningCycleEventGroup[] | undefined;
}

interface CycleFormValidityInput {
  cycleForm: CycleFormState;
}

interface TemplateFormValidityInput {
  templateForm: TemplateFormState;
}

interface SelectedCycleInput {
  cycle: SelectedPlanningCycle | null | undefined;
}

interface PlanningCyclesTableRowInput {
  cycle: PlanningCycleSummary;
}

interface TemplateLibraryTableRowInput {
  template: PlanningTemplateSummary;
}

interface CycleCalendarTableRowInput {
  eventGroup: PlanningCycleEventGroup;
}

export function createEmptyCycleForm(): CycleFormState {
  return {
    name: '',
    startDate: '',
    endDate: '',
  };
}

export function createEmptyTemplateBlock(): TemplateBlockDraft {
  templateBlockDraftCounter += 1;

  return {
    id: `template-block-${templateBlockDraftCounter}`,
    label: '',
    startTime: null,
    endTime: null,
  };
}

export function createEmptyTemplateForm(): TemplateFormState {
  return {
    name: '',
    weekday: '0',
    blocks: [createEmptyTemplateBlock()],
  };
}

export function createTemplateFormFromTemplate({
  template,
}: TemplateFormFromTemplateInput): TemplateFormState {
  return {
    name: template.name,
    weekday: String(template.weekday),
    blocks: [...template.blocks]
      .sort((leftBlock, rightBlock) => leftBlock.order - rightBlock.order)
      .map((block) => ({
        id: block.id,
        label: block.label,
        startTime: parseTimeOfDay({ value: block.startTime }),
        endTime: parseTimeOfDay({ value: block.endTime }),
      })),
  };
}

export function getErrorMessage({ error }: ErrorMessageInput): string {
  if (isAxiosError(error)) {
    const response = error.response?.data;

    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof response.message === 'string'
    ) {
      return response.message;
    }

    if (
      response &&
      typeof response === 'object' &&
      'error' in response &&
      typeof response.error === 'string'
    ) {
      return response.error;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

export function isForbiddenError({ error }: ForbiddenErrorInput): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

export function getSelectedCycleIdOrThrow({
  selectedCycleId,
}: SelectedCycleIdInput): string {
  if (!selectedCycleId) {
    throw new Error('No cycle selected');
  }

  return selectedCycleId;
}

function cycleDateKey({ date }: FormatDateInput): string {
  return date.slice(0, 10);
}

export function describeTemplate({ template }: DescribeTemplateInput): string {
  return `${WEEKDAYS[template.weekday] ?? 'Unknown'} · ${template.blocks.length} block${template.blocks.length === 1 ? '' : 's'}`;
}

export interface DescribeTimeBlockSpanInput {
  startTime: TimeOfDay;
  endTime: TimeOfDay;
}

/** `Runs 4h · ends next day` for a block whose end crosses midnight, or
 * `Runs 30m` for a same-day span (ADR-0003's computed-span confirmation). */
export function describeTimeBlockSpan({
  startTime,
  endTime,
}: DescribeTimeBlockSpanInput): string {
  return describeSpan({
    span: timeOfDaySpan({ start: startTime, end: endTime }),
  });
}

export function sortTemplateBlocks({
  blocks,
}: SortTemplateBlocksInput): CreateEventTemplateBody['blocks'] {
  return blocks.map((block, index) => {
    if (!block.startTime || !block.endTime) {
      throw new Error('Block is missing a start or end time');
    }

    return {
      label: block.label.trim(),
      startTime: block.startTime,
      endTime: block.endTime,
      order: index,
    };
  });
}

export function stateBadgeVariant({
  state,
}: CycleStateVariantInput): 'default' | 'outline' | 'secondary' {
  if (state === 'locked') {
    return 'default';
  }

  if (state === 'archived') {
    return 'outline';
  }

  return 'secondary';
}

export function eventStatusBadgeVariant({
  status,
}: EventStatusVariantInput): 'default' | 'destructive' | 'secondary' {
  if (status === 'scheduled') {
    return 'default';
  }

  if (status === 'cancelled') {
    return 'destructive';
  }

  return 'secondary';
}

export interface ShiftedEndInput {
  newStart: Instant;
  originalStart: string;
  originalEnd: string;
}

/**
 * Preserves a day/event's own duration when only its start moves (FR-007's
 * date edit): shifts the end by the same delta so start < end always holds,
 * mirroring FR-007a's slot-cascade delta but for the event row itself.
 */
export function shiftedEnd({
  newStart,
  originalStart,
  originalEnd,
}: ShiftedEndInput): Instant {
  const delta = millisecondsBetween({
    start: parseInstant({ value: originalStart }),
    end: newStart,
  });
  return addMilliseconds({
    instant: parseInstant({ value: originalEnd }),
    milliseconds: delta,
  });
}

export function calculateTotalSlots({ events }: TotalSlotsInput): number {
  return (
    events?.reduce((count, eventGroup) => count + eventGroup.slots.length, 0) ??
    0
  );
}

export function canCreateCycle({ cycleForm }: CycleFormValidityInput): boolean {
  return (
    cycleForm.name.trim() !== '' &&
    cycleForm.startDate !== '' &&
    cycleForm.endDate !== '' &&
    cycleForm.startDate < cycleForm.endDate
  );
}

export function canCreateTemplate({
  templateForm,
}: TemplateFormValidityInput): boolean {
  return (
    templateForm.name.trim() !== '' &&
    templateForm.blocks.length > 0 &&
    templateForm.blocks.every(
      (block) =>
        block.label.trim() !== '' &&
        block.startTime !== null &&
        block.endTime !== null &&
        // An end before its start crosses midnight (ADR-0003); only a
        // zero-length block (equal start and end) is invalid.
        block.startTime !== block.endTime,
    )
  );
}

export function cycleIsLocked({ cycle }: SelectedCycleInput): boolean {
  return cycle?.state === 'locked';
}

export interface IsMultiDayEventInput {
  eventStart: string;
  eventEnd: string;
}

/**
 * A slot's start/end only needs its own date field when the parent event
 * spans 2+ calendar days (a multi-day day-based event) — for a single-day
 * event the date is already implied, so the slot dialogs show time only.
 */
export function isMultiDayEvent({
  eventStart,
  eventEnd,
}: IsMultiDayEventInput): boolean {
  return (
    cycleDateKey({ date: eventStart }) !== cycleDateKey({ date: eventEnd })
  );
}

export function toPlanningCyclesTableRow({
  cycle,
}: PlanningCyclesTableRowInput): PlanningCyclesTableRow {
  return {
    id: cycle.id,
    name: cycle.name,
    window: `${formatCalendarDateOnly({ value: cycle.startDate })} → ${formatCalendarDateOnly({ value: cycle.endDate })}`,
    state: cycle.state,
  };
}

export function toTemplateLibraryTableRow({
  template,
}: TemplateLibraryTableRowInput): TemplateLibraryTableRow {
  return {
    id: template.id,
    name: template.name,
    weekday: WEEKDAYS[template.weekday] ?? 'Unknown',
    blockCount: template.blocks.length,
    description: describeTemplate({ template }),
  };
}

export function toCycleCalendarTableRow({
  eventGroup,
}: CycleCalendarTableRowInput): CycleCalendarTableRow {
  const isOnlySlotInEvent = eventGroup.slots.length === 1;

  return {
    eventId: eventGroup.event.id,
    title: eventGroup.event.title,
    start: eventGroup.event.start,
    eventType: eventGroup.event.eventType,
    status: eventGroup.event.status,
    slots: eventGroup.slots.map(
      (slot): CycleCalendarSlotRow => ({
        slotId: slot.id,
        label: slot.label ?? 'Slot',
        startTime: slot.startTime,
        endTime: slot.endTime,
        isOnlySlotInEvent,
      }),
    ),
  };
}
