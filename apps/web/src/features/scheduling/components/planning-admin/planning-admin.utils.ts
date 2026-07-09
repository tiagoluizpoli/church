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
    startTime: '',
    endTime: '',
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
        startTime: block.startTime,
        endTime: block.endTime,
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
    throw new Error('No planning cycle selected');
  }

  return selectedCycleId;
}

export function formatCycleDate({ date }: FormatDateInput): string {
  return date.slice(0, 10);
}

export function formatEventDateTime({ date }: FormatDateInput): string {
  return `${date.slice(0, 10)} ${date.slice(11, 16)}Z`;
}

export function describeTemplate({ template }: DescribeTemplateInput): string {
  return `${WEEKDAYS[template.weekday] ?? 'Unknown'} · ${template.blocks.length} block${template.blocks.length === 1 ? '' : 's'}`;
}

export function sortTemplateBlocks({
  blocks,
}: SortTemplateBlocksInput): CreateEventTemplateBody['blocks'] {
  return blocks.map((block, index) => ({
    label: block.label.trim(),
    startTime: block.startTime,
    endTime: block.endTime,
    order: index,
  }));
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

export interface ShiftedEndDateInput {
  newStartDate: string;
  originalStartDate: string;
  originalEndDate: string;
}

/**
 * Preserves a day/event's own duration when only its start moves (FR-007's
 * date edit): shifts the end by the same delta so start < end always holds,
 * mirroring FR-007a's slot-cascade delta but for the event row itself.
 */
export function shiftedEndDate({
  newStartDate,
  originalStartDate,
  originalEndDate,
}: ShiftedEndDateInput): string {
  const delta =
    new Date(newStartDate).getTime() - new Date(originalStartDate).getTime();
  return new Date(new Date(originalEndDate).getTime() + delta).toISOString();
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
        block.startTime !== '' &&
        block.endTime !== '' &&
        block.startTime < block.endTime,
    )
  );
}

export function cycleIsLocked({ cycle }: SelectedCycleInput): boolean {
  return cycle?.state === 'locked';
}

export interface IsMultiDayEventInput {
  startDate: string;
  endDate: string;
}

/**
 * A slot's start/end only needs its own date field when the parent event
 * spans 2+ calendar days (a multi-day day-based event) — for a single-day
 * event the date is already implied, so the slot dialogs show time only.
 */
export function isMultiDayEvent({
  startDate,
  endDate,
}: IsMultiDayEventInput): boolean {
  return (
    formatCycleDate({ date: startDate }) !== formatCycleDate({ date: endDate })
  );
}

export function toPlanningCyclesTableRow({
  cycle,
}: PlanningCyclesTableRowInput): PlanningCyclesTableRow {
  return {
    id: cycle.id,
    name: cycle.name,
    window: `${formatCycleDate({ date: cycle.startDate })} → ${formatCycleDate({ date: cycle.endDate })}`,
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
  };
}

interface PadTwoDigitsInput {
  value: number;
}

function padTwoDigits({ value }: PadTwoDigitsInput): string {
  return String(value).padStart(2, '0');
}

export interface ToDateTimeLocalValueInput {
  iso: string;
}

export function toDateTimeLocalValue({
  iso,
}: ToDateTimeLocalValueInput): string {
  const date = new Date(iso);
  const month = padTwoDigits({ value: date.getMonth() + 1 });
  const day = padTwoDigits({ value: date.getDate() });
  const hours = padTwoDigits({ value: date.getHours() });
  const minutes = padTwoDigits({ value: date.getMinutes() });
  return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

export interface FromDateTimeLocalValueInput {
  value: string;
}

export function fromDateTimeLocalValue({
  value,
}: FromDateTimeLocalValueInput): string {
  return new Date(value).toISOString();
}

export interface TimePartOfInput {
  value: string;
}

export function timePartOf({ value }: TimePartOfInput): string {
  return value.split('T')[1] ?? '';
}

export interface WithUpdatedTimeInput {
  value: string;
  time: string;
}

export function withUpdatedTime({ value, time }: WithUpdatedTimeInput): string {
  return `${value.split('T')[0]}T${time}`;
}

export function toCycleCalendarTableRow({
  eventGroup,
}: CycleCalendarTableRowInput): CycleCalendarTableRow {
  const isOnlySlotInEvent = eventGroup.slots.length === 1;
  console.log(
    'toCycleCalendarTableRow event:',
    eventGroup.event.title,
    'slots:',
    eventGroup.slots.map((s) => s.label),
    'isOnly:',
    isOnlySlotInEvent,
  );

  return {
    eventId: eventGroup.event.id,
    title: eventGroup.event.title,
    startDate: eventGroup.event.startDate,
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
