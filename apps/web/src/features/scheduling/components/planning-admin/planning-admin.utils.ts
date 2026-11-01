import { m } from '@church/i18n/messages';
import {
  addMilliseconds,
  formatWeekdayOfIndex,
  type Instant,
  instantSpan,
  type Locale,
  millisecondsBetween,
  parseInstant,
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDaySpan,
} from '@church/time';
import { isAxiosError } from 'axios';
import type {
  CycleCalendarEventTimeBlockRow,
  CycleCalendarTableRow,
  CycleEventGroup,
  CycleFormState,
  CycleSummary,
  CyclesTableRow,
  PlanningTemplateSummary,
  SelectedCycle,
  TemplateFormState,
  TemplateLibraryTableRow,
  TemplateTimeBlockDraft,
} from './planning-admin.types';
import type {
  GetCycle200EventsItemEventStatus,
  ListCycles200CyclesItemState,
  UpdateEventTemplateBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { describeSpan } from '@/shared/utils/span-description';

let templateTemplateTimeBlockDraftCounter = 0;

interface FormatDateInput {
  date: string;
}

interface DescribeTemplateInput {
  template: PlanningTemplateSummary;
  locale: Locale;
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

interface TemplateRequestBlocksInput {
  blocks: TemplateTimeBlockDraft[];
}

interface CycleStateVariantInput {
  state: ListCycles200CyclesItemState;
}

interface EventStatusVariantInput {
  status: GetCycle200EventsItemEventStatus;
}

interface TotalEventTimeBlocksInput {
  events: CycleEventGroup[] | undefined;
}

interface CycleFormValidityInput {
  cycleForm: CycleFormState;
}

interface TemplateFormValidityInput {
  templateForm: TemplateFormState;
}

interface SelectedCycleInput {
  cycle: SelectedCycle | null | undefined;
}

interface CyclesTableRowInput {
  cycle: CycleSummary;
}

interface TemplateLibraryTableRowInput {
  template: PlanningTemplateSummary;
  locale: Locale;
}

interface CycleCalendarTableRowInput {
  eventGroup: CycleEventGroup;
}

export function createEmptyCycleForm(): CycleFormState {
  return {
    name: '',
    startDate: '',
    endDate: '',
  };
}

export function createEmptyTemplateTimeBlock(): TemplateTimeBlockDraft {
  templateTemplateTimeBlockDraftCounter += 1;

  return {
    key: `template-time-block-${templateTemplateTimeBlockDraftCounter}`,
    label: '',
    startTime: null,
    endTime: null,
  };
}

export function createEmptyTemplateForm(): TemplateFormState {
  return {
    name: '',
    weekday: '0',
    blocks: [createEmptyTemplateTimeBlock()],
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
        key: block.id,
        persistedId: block.id,
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

  return m.common_generic_error();
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

export function describeTemplate({
  template,
  locale,
}: DescribeTemplateInput): string {
  const day = formatWeekdayOfIndex({
    index: template.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    locale,
  });
  const count = template.blocks.length;
  const blockCount = pluralMessage({
    count,
    one: m.event_templates_block_count_one,
    other: () => m.event_templates_block_count_other({ count }),
  });
  return `${day} · ${blockCount}`;
}

export interface DescribeTemplateTimeBlockSpanInput {
  startTime: TimeOfDay;
  endTime: TimeOfDay;
}

/** `Runs 4h · ends next day` for a block whose end crosses midnight, or
 * `Runs 30m` for a same-day span (ADR-0003's computed-span confirmation). */
export function describeTemplateTimeBlockSpan({
  startTime,
  endTime,
}: DescribeTemplateTimeBlockSpanInput): string {
  return describeSpan({
    span: timeOfDaySpan({ start: startTime, end: endTime }),
  });
}

/** Request blocks in entered order (the server derives `order`); only blocks
 * loaded for edit carry their persisted `id`, so create never sends one. */
export function toTemplateRequestBlocks({
  blocks,
}: TemplateRequestBlocksInput): UpdateEventTemplateBody['blocks'] {
  return blocks.map((block) => {
    if (!block.startTime || !block.endTime) {
      throw new Error('Block is missing a start or end time');
    }

    return {
      ...(block.persistedId && { id: block.persistedId }),
      label: block.label.trim(),
      startTime: block.startTime,
      endTime: block.endTime,
    };
  });
}

interface TemplateRequestBodyInput {
  form: TemplateFormState;
}

/** The complete desired state sent by both create and edit. */
export function toTemplateRequestBody({
  form,
}: TemplateRequestBodyInput): UpdateEventTemplateBody {
  return {
    name: form.name.trim(),
    weekday: Number.parseInt(form.weekday, 10),
    blocks: toTemplateRequestBlocks({ blocks: form.blocks }),
  };
}

export interface TemplateBlockErrors {
  /** Row keys whose label repeats another row's, ignoring case and spacing. */
  duplicateLabelKeys: Set<string>;
  /** Row keys whose start equals their end. */
  equalTimeKeys: Set<string>;
}

/** Inline validation the editor can show before the server is asked. */
export function templateBlockErrors({
  blocks,
}: TemplateRequestBlocksInput): TemplateBlockErrors {
  const seen = new Map<string, string>();
  const duplicateLabelKeys = new Set<string>();
  const equalTimeKeys = new Set<string>();
  for (const block of blocks) {
    const label = block.label.trim().toLowerCase();
    if (label !== '') {
      const first = seen.get(label);
      if (first === undefined) {
        seen.set(label, block.key);
      } else {
        duplicateLabelKeys.add(first).add(block.key);
      }
    }
    if (block.startTime && block.startTime === block.endTime) {
      equalTimeKeys.add(block.key);
    }
  }
  return { duplicateLabelKeys, equalTimeKeys };
}

export function stateBadgeVariant({
  state,
}: CycleStateVariantInput): 'default' | 'outline' | 'secondary' {
  if (state === 'sent') {
    return 'default';
  }

  if (state === 'past') {
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
 * mirroring FR-007a's time-block-cascade delta but for the event row itself.
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

export function calculateTotalEventTimeBlocks({
  events,
}: TotalEventTimeBlocksInput): number {
  return (
    events?.reduce(
      (count, eventGroup) => count + eventGroup.eventTimeBlocks.length,
      0,
    ) ?? 0
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

export function canSaveTemplate({
  templateForm,
}: TemplateFormValidityInput): boolean {
  const { duplicateLabelKeys } = templateBlockErrors({
    blocks: templateForm.blocks,
  });
  return (
    templateForm.name.trim() !== '' &&
    templateForm.blocks.length > 0 &&
    duplicateLabelKeys.size === 0 &&
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

export function cycleIsSent({ cycle }: SelectedCycleInput): boolean {
  return cycle?.state === 'sent';
}

export interface IsMultiDayEventInput {
  eventStart: string;
  eventEnd: string;
}

/**
 * A time block's start/end only needs its own date field when the parent event
 * spans 2+ calendar days (a multi-day day-based event) — for a single-day
 * event the date is already implied, so the time block dialogs show time only.
 */
export function isMultiDayEvent({
  eventStart,
  eventEnd,
}: IsMultiDayEventInput): boolean {
  return (
    cycleDateKey({ date: eventStart }) !== cycleDateKey({ date: eventEnd })
  );
}

export interface EventSpanLabelInput {
  start: string;
  end: string;
  timeZone: string;
}

/** Label key for an Event: `day_based` when its start and end fall on
 * different CalendarDays in the Church Timezone, else `hourly`. */
export function eventSpanLabel({
  start,
  end,
  timeZone,
}: EventSpanLabelInput): 'hourly' | 'day_based' {
  const { crossesToNextDay } = instantSpan({
    start: parseInstant({ value: start }),
    end: parseInstant({ value: end }),
    timeZone,
  });
  return crossesToNextDay ? 'day_based' : 'hourly';
}

export function toCyclesTableRow({
  cycle,
}: CyclesTableRowInput): CyclesTableRow {
  return {
    id: cycle.id,
    name: cycle.name,
    window: `${formatCalendarDateOnly({ value: cycle.startDate })} → ${formatCalendarDateOnly({ value: cycle.endDate })}`,
    state: cycle.state,
  };
}

export function toTemplateLibraryTableRow({
  template,
  locale,
}: TemplateLibraryTableRowInput): TemplateLibraryTableRow {
  return {
    id: template.id,
    name: template.name,
    weekday: formatWeekdayOfIndex({
      index: template.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      locale,
    }),
    blockCount: template.blocks.length,
    description: describeTemplate({ template, locale }),
  };
}

export function toCycleCalendarTableRow({
  eventGroup,
}: CycleCalendarTableRowInput): CycleCalendarTableRow {
  const isOnlyEventTimeBlockInEvent = eventGroup.eventTimeBlocks.length === 1;

  return {
    eventId: eventGroup.event.id,
    title: eventGroup.event.title,
    start: eventGroup.event.start,
    end: eventGroup.event.end,
    status: eventGroup.event.status,
    eventTimeBlocks: eventGroup.eventTimeBlocks.map(
      (eventTimeBlock): CycleCalendarEventTimeBlockRow => ({
        eventTimeBlockId: eventTimeBlock.id,
        label: eventTimeBlock.label ?? 'Time block',
        startTime: eventTimeBlock.startTime,
        endTime: eventTimeBlock.endTime,
        isOnlyEventTimeBlockInEvent,
      }),
    ),
  };
}
