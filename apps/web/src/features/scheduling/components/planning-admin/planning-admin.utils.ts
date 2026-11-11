import { m } from '@church/i18n/messages';
import {
  addCalendarDays,
  compareInstants,
  formatMonthYear,
  formatWeekdayOfIndex,
  instantSpan,
  type Locale,
  now,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDaySpan,
  weekdayIndex,
} from '@church/time';
import { isAxiosError } from 'axios';
import type {
  CycleCalendarEventTimeBlockRow,
  CycleCalendarTableRow,
  CycleCalendarWeek,
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
import { dayOf, formatCalendarDateOnly } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { describeSpan } from '@/shared/utils/span-description';

let templateTemplateTimeBlockDraftCounter = 0;

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

/** Matches the server's `cycle.name` bound. */
export const CYCLE_NAME_MAX_LENGTH = 255;

export function isCycleNameTooLong({
  cycleForm,
}: CycleFormValidityInput): boolean {
  return cycleForm.name.trim().length > CYCLE_NAME_MAX_LENGTH;
}

/** Both dates chosen and the end day before the start day. */
export function isCycleRangeReversed({
  cycleForm,
}: CycleFormValidityInput): boolean {
  return (
    cycleForm.startDate !== '' &&
    cycleForm.endDate !== '' &&
    cycleForm.startDate > cycleForm.endDate
  );
}

export function canCreateCycle({ cycleForm }: CycleFormValidityInput): boolean {
  return (
    cycleForm.name.trim() !== '' &&
    !isCycleNameTooLong({ cycleForm }) &&
    cycleForm.startDate !== '' &&
    cycleForm.endDate !== '' &&
    !isCycleRangeReversed({ cycleForm })
  );
}

interface SuggestCycleNameInput {
  startDate: string;
  locale: Locale;
}

/** `October 2026` / `Outubro 2026` for the start month; empty until chosen. */
export function suggestCycleName({
  startDate,
  locale,
}: SuggestCycleNameInput): string {
  return startDate === ''
    ? ''
    : formatMonthYear({ day: parseCalendarDay({ value: startDate }), locale });
}

interface GroupCyclesInput {
  cycles: CycleSummary[];
}

interface GroupedCycles {
  current: CycleSummary[];
  past: CycleSummary[];
}

/** Current (Draft/Sent) and Past Cycles, each newest start first. */
export function groupCyclesForList({
  cycles,
}: GroupCyclesInput): GroupedCycles {
  const sorted = [...cycles].sort(
    (left, right) =>
      right.startDate.localeCompare(left.startDate) ||
      right.endDate.localeCompare(left.endDate) ||
      left.id.localeCompare(right.id),
  );
  return {
    current: sorted.filter((cycle) => cycle.state !== 'past'),
    past: sorted.filter((cycle) => cycle.state === 'past'),
  };
}

export interface ConflictingCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

/** The Cycles a 409 `OVERLAPPING_CYCLE` response names; none for any other failure. */
export function conflictingCyclesOf({
  error,
}: ErrorMessageInput): ConflictingCycle[] {
  const data = isAxiosError(error) ? error.response?.data : undefined;
  return data &&
    typeof data === 'object' &&
    'conflictingCycles' in data &&
    Array.isArray(data.conflictingCycles)
    ? data.conflictingCycles
    : [];
}

export interface OutsideEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

/** The Events a 409 `EVENT_OUTSIDE_CYCLE` edit refusal names; none for any other failure. */
export function outsideEventsOf({ error }: ErrorMessageInput): OutsideEvent[] {
  const data = isAxiosError(error) ? error.response?.data : undefined;
  return data &&
    typeof data === 'object' &&
    'outsideEvents' in data &&
    Array.isArray(data.outsideEvents)
    ? data.outsideEvents
    : [];
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

/** Sent and Past Cycles are review-only: only a Draft exposes mutation controls. */
export function cycleIsReadOnly({ cycle }: SelectedCycleInput): boolean {
  return Boolean(cycle) && cycle?.state !== 'draft';
}

interface CycleStateLabelInput {
  state: SelectedCycle['state'];
}

export function cycleStateLabel({ state }: CycleStateLabelInput): string {
  if (state === 'sent') return m.cycle_state_sent();
  if (state === 'past') return m.cycle_state_past();
  return m.cycle_state_draft();
}

interface EventStatusLabelInput {
  status: CycleEventGroup['event']['status'];
}

export function eventStatusLabel({ status }: EventStatusLabelInput): string {
  if (status === 'scheduled') return m.event_status_scheduled();
  if (status === 'cancelled') return m.event_status_cancelled();
  if (status === 'past') return m.event_status_past();
  return m.event_status_draft();
}

interface TimeBlockCountInput {
  count: number;
}

export function timeBlockCountLabel({ count }: TimeBlockCountInput): string {
  return pluralMessage({
    count,
    one: () => m.cycle_review_time_block_count_one(),
    other: () => m.cycle_review_time_block_count_other({ count }),
  });
}

interface ErrorStatusInput {
  error: unknown;
}

export function isNotFoundError({ error }: ErrorStatusInput): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

const DAYS_IN_WEEK = 7;

interface CompareRowsInput {
  left: CycleCalendarTableRow;
  right: CycleCalendarTableRow;
}

/** Start ascending; equal starts fall back to end, title, then id so the
 * order never depends on the response order. */
function compareReviewRows({ left, right }: CompareRowsInput): number {
  return (
    Date.parse(left.start) - Date.parse(right.start) ||
    Date.parse(left.end) - Date.parse(right.end) ||
    left.title.localeCompare(right.title) ||
    left.eventId.localeCompare(right.eventId)
  );
}

interface GroupRowsByWeekInput {
  rows: CycleCalendarTableRow[];
  timeZone: string;
}

/** Groups Events by the Sunday-first Church-local week of their start day
 * (the weekday-index convention of Event templates), so a multi-day Event
 * appears once, in the week it starts. */
export function groupRowsByWeek({
  rows,
  timeZone,
}: GroupRowsByWeekInput): CycleCalendarWeek[] {
  const weeks = new Map<string, CycleCalendarWeek>();

  for (const row of [...rows].sort((left, right) =>
    compareReviewRows({ left, right }),
  )) {
    const day = dayOf({ value: row.start, timeZone });
    const weekStart = addCalendarDays({
      day,
      days: -weekdayIndex({ day }),
    });
    const week = weeks.get(weekStart) ?? {
      weekStart,
      weekEnd: addCalendarDays({ day: weekStart, days: DAYS_IN_WEEK - 1 }),
      rows: [],
    };
    week.rows.push(row);
    weeks.set(weekStart, week);
  }

  return [...weeks.values()];
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
    window: `${formatCalendarDateOnly({ value: cycle.startDate })} – ${formatCalendarDateOnly({ value: cycle.endDate })}`,
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
    location: eventGroup.event.location,
    start: eventGroup.event.start,
    end: eventGroup.event.end,
    status: eventGroup.event.status,
    eventTimeBlocks: eventGroup.eventTimeBlocks.map(
      (eventTimeBlock): CycleCalendarEventTimeBlockRow => ({
        eventTimeBlockId: eventTimeBlock.id,
        label: eventTimeBlock.label ?? m.cycle_review_time_block_fallback(),
        startTime: eventTimeBlock.startTime,
        endTime: eventTimeBlock.endTime,
        status: eventTimeBlock.status,
        isOnlyEventTimeBlockInEvent,
      }),
    ),
  };
}

interface CanCancelEventTimeBlockInput {
  /** The Event allows block cancellation: Sent Cycle, scheduled Event. */
  eventAllows: boolean;
  status: string;
  start: string;
}

/** An active block that has not started; a started sibling does not matter. */
export function canCancelEventTimeBlock({
  eventAllows,
  status,
  start,
}: CanCancelEventTimeBlockInput): boolean {
  const started =
    compareInstants({ left: now(), right: parseInstant({ value: start }) }) >=
    0;
  return eventAllows && status === 'active' && !started;
}

/** A scheduled Event of a Sent Cycle; each block is judged on its own start. */
export function canCancelEventBlocks({
  cycleState,
  eventStatus,
}: Omit<CanCancelEventInput, 'start'>): boolean {
  return cycleState === 'sent' && eventStatus === 'scheduled';
}

interface CanCancelEventInput {
  cycleState: string;
  eventStatus: string;
  start: string;
}

/** A scheduled Event of a Sent Cycle that has not started; the server decides. */
export function canCancelEvent({
  cycleState,
  eventStatus,
  start,
}: CanCancelEventInput): boolean {
  const startInstant = parseInstant({ value: start });
  const started = compareInstants({ left: now(), right: startInstant }) >= 0;
  return cycleState === 'sent' && eventStatus === 'scheduled' && !started;
}
