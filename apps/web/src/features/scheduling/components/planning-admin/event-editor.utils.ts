import { m } from '@church/i18n/messages';
import {
  compareCalendarDays,
  compareInstants,
  type Instant,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  today,
  toInstant,
} from '@church/time';
import { isAxiosError } from 'axios';
import type {
  CreatePlanningEventBody,
  GetCycle200EventsItem,
  UpdatePlanningEventBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

/** One labelled Time block row; `id` is set only for a persisted block. */
export interface EventEditorBlock {
  key: string;
  id?: string;
  label: string;
  start: Instant;
  end: Instant;
  /** The initial whole-Event row follows title and bounds until edited. */
  followsEvent: boolean;
}

export interface EventEditorFormState {
  title: string;
  location: string;
  start: Instant;
  end: Instant;
  blocks: EventEditorBlock[];
}

/** The inclusive Cycle days an Event's Church-local start must fall within. */
export interface EventEditorCycleRange {
  startDate: string;
  endDate: string;
}

const DEFAULT_EVENT_START_TIME = parseTimeOfDay({ value: '19:00' });
const DEFAULT_EVENT_END_TIME = parseTimeOfDay({ value: '21:00' });

let blockKeySequence = 0;

function nextBlockKey(): string {
  blockKeySequence += 1;
  return `event-block-${blockKeySequence}`;
}

interface CreateEventFormInput {
  cycle: EventEditorCycleRange;
  timeZone: string;
}

/** A new Event on the Cycle's first day, with one row covering all of it. */
export function createEventForm({
  cycle,
  timeZone,
}: CreateEventFormInput): EventEditorFormState {
  const day = parseCalendarDay({ value: cycle.startDate.slice(0, 10) });
  const start = toInstant({ day, time: DEFAULT_EVENT_START_TIME, timeZone });
  const end = toInstant({ day, time: DEFAULT_EVENT_END_TIME, timeZone });
  return {
    title: '',
    location: '',
    start,
    end,
    blocks: [
      { key: nextBlockKey(), label: '', start, end, followsEvent: true },
    ],
  };
}

interface EditEventFormInput {
  graph: GetCycle200EventsItem;
}

/** A persisted Event as the editor holds it: every row is already its own. */
export function editEventForm({
  graph,
}: EditEventFormInput): EventEditorFormState {
  const { event, eventTimeBlocks } = graph;
  return {
    title: event.title,
    location: event.location ?? '',
    start: parseInstant({ value: event.start }),
    end: parseInstant({ value: event.end }),
    blocks: eventTimeBlocks.map((block) => ({
      key: nextBlockKey(),
      id: block.id,
      label: block.label ?? '',
      start: parseInstant({ value: block.startTime }),
      end: parseInstant({ value: block.endTime }),
      followsEvent: false,
    })),
  };
}

interface AddBlockInput {
  form: EventEditorFormState;
}

/** A further row starts as the whole Event, already the person's own. */
export function addEventBlock({ form }: AddBlockInput): EventEditorFormState {
  return {
    ...form,
    blocks: [
      ...form.blocks,
      {
        key: nextBlockKey(),
        label: '',
        start: form.start,
        end: form.end,
        followsEvent: false,
      },
    ],
  };
}

export type EventFieldChange =
  | { field: 'title' | 'location'; value: string }
  | { field: 'start' | 'end'; value: Instant };

interface ChangeEventFieldInput {
  form: EventEditorFormState;
  change: EventFieldChange;
}

/** Applies an Event field; only rows still following the Event move with it. */
export function changeEventField({
  form,
  change,
}: ChangeEventFieldInput): EventEditorFormState {
  const next = { ...form, [change.field]: change.value };
  return {
    ...next,
    blocks: next.blocks.map((block) =>
      block.followsEvent
        ? { ...block, label: next.title, start: next.start, end: next.end }
        : block,
    ),
  };
}

export type EventBlockChange =
  | { blockKey: string; field: 'label'; value: string }
  | { blockKey: string; field: 'start' | 'end'; value: Instant };

interface ChangeBlockInput {
  form: EventEditorFormState;
  change: EventBlockChange;
}

/** Editing a row makes it the person's own: it stops following the Event. */
export function changeEventBlock({
  form,
  change,
}: ChangeBlockInput): EventEditorFormState {
  return {
    ...form,
    blocks: form.blocks.map((block) =>
      block.key === change.blockKey
        ? { ...block, [change.field]: change.value, followsEvent: false }
        : block,
    ),
  };
}

export interface EventBlockErrors {
  label?: string;
  time?: string;
}

export interface EventEditorErrors {
  start?: string;
  end?: string;
  blocks: Map<string, EventBlockErrors>;
  /** A refusal with no field of its own, e.g. no Time block left. */
  form?: string;
}

interface EventEditorErrorsInput {
  form: EventEditorFormState;
  cycle: EventEditorCycleRange;
  timeZone: string;
}

interface IsPositiveInput {
  start: Instant;
  end: Instant;
}

function isPositive({ start, end }: IsPositiveInput): boolean {
  return compareInstants({ left: start, right: end }) < 0;
}

/**
 * The server's final-graph rules, checked before Save: positive bounds, a
 * Church-local start day inside the inclusive Cycle, contained rows and
 * labels unique ignoring case. Blank text only disables Save.
 */
export function eventEditorErrors({
  form,
  cycle,
  timeZone,
}: EventEditorErrorsInput): EventEditorErrors {
  const errors: EventEditorErrors = { blocks: new Map() };
  const eventIsPositive = isPositive({ start: form.start, end: form.end });
  if (!eventIsPositive) {
    errors.end = m.error_validation_invalid_event_bounds();
  }

  const startDay = today({ instant: form.start, timeZone });
  const firstDay = parseCalendarDay({ value: cycle.startDate.slice(0, 10) });
  const lastDay = parseCalendarDay({ value: cycle.endDate.slice(0, 10) });
  if (
    compareCalendarDays({ left: startDay, right: firstDay }) < 0 ||
    compareCalendarDays({ left: startDay, right: lastDay }) > 0
  ) {
    errors.start = m.error_event_outside_cycle();
  }

  if (form.blocks.length === 0) {
    errors.form = m.error_last_remaining_event_time_block();
  }

  const seenLabels = new Set<string>();
  for (const block of form.blocks) {
    const blockErrors: EventBlockErrors = {};
    const labelKey = block.label.trim().toLowerCase();
    if (labelKey !== '' && seenLabels.has(labelKey)) {
      blockErrors.label = m.error_validation_duplicate_event_time_block_label();
    }
    seenLabels.add(labelKey);

    if (!isPositive({ start: block.start, end: block.end })) {
      blockErrors.time = m.error_validation_invalid_event_bounds();
    } else if (
      eventIsPositive &&
      (compareInstants({ left: block.start, right: form.start }) < 0 ||
        compareInstants({ left: block.end, right: form.end }) > 0)
    ) {
      blockErrors.time = m.error_validation_event_time_block_out_of_bounds();
    }

    if (blockErrors.label || blockErrors.time) {
      errors.blocks.set(block.key, blockErrors);
    }
  }

  return errors;
}

interface CanSaveEventInput {
  form: EventEditorFormState;
  errors: EventEditorErrors;
}

export function canSaveEvent({ form, errors }: CanSaveEventInput): boolean {
  return (
    form.title.trim() !== '' &&
    form.blocks.every((block) => block.label.trim() !== '') &&
    !errors.start &&
    !errors.end &&
    !errors.form &&
    errors.blocks.size === 0
  );
}

interface ToCreateEventBodyInput {
  form: EventEditorFormState;
}

export function toCreateEventBody({
  form,
}: ToCreateEventBodyInput): CreatePlanningEventBody {
  const location = form.location.trim();
  return {
    title: form.title.trim(),
    ...(location ? { location } : {}),
    start: form.start,
    end: form.end,
    eventTimeBlocks: form.blocks.map((block) => ({
      label: block.label.trim(),
      startTime: block.start,
      endTime: block.end,
    })),
  };
}

interface ToUpdateEventBodyInput {
  form: EventEditorFormState;
}

/** The complete desired graph: rows keep their ids; new rows have none. */
export function toUpdateEventBody({
  form,
}: ToUpdateEventBodyInput): UpdatePlanningEventBody {
  const body = toCreateEventBody({ form });
  return {
    ...body,
    eventTimeBlocks: body.eventTimeBlocks.map((block, index) => {
      const id = form.blocks[index]?.id;
      return id ? { id, ...block } : block;
    }),
  };
}

/** Where a server refusal is shown: an Event field, one row, or the form. */
export type EventSaveRefusalTarget =
  | { kind: 'start' | 'end' | 'form' }
  | { kind: 'block'; index: number; part: 'label' | 'time' };

export interface EventSaveRefusal {
  target: EventSaveRefusalTarget;
  message: string;
  /** The Cycle left Draft meanwhile: the authoritative state must reload. */
  stateConflict: boolean;
}

interface ToEventSaveRefusalInput {
  error: unknown;
}

/** The refusal envelope fields this editor reads, across 409 and 422. */
interface EventRefusalBody {
  error?: string;
  field?: string;
}

const BLOCK_FIELD_PATTERN = /^eventTimeBlocks\.(\d+)(?:\.(\w+))?$/;

interface FieldTargetInput {
  field: string | undefined;
}

function fieldTarget({ field }: FieldTargetInput): EventSaveRefusalTarget {
  if (field === 'start' || field === 'end') {
    return { kind: field };
  }
  const match = field ? BLOCK_FIELD_PATTERN.exec(field) : null;
  if (match) {
    return {
      kind: 'block',
      index: Number(match[1]),
      part: match[2] === 'label' ? 'label' : 'time',
    };
  }
  return { kind: 'form' };
}

/** Places the server's localized refusal beside the field it names. */
export function toEventSaveRefusal({
  error,
}: ToEventSaveRefusalInput): EventSaveRefusal {
  const body = isAxiosError<EventRefusalBody>(error)
    ? error.response?.data
    : undefined;
  const message = requestErrorMessage(error);
  if (body?.error === 'EVENT_OUTSIDE_CYCLE') {
    return { target: { kind: 'start' }, message, stateConflict: false };
  }
  return {
    target: fieldTarget({ field: body?.field }),
    message,
    stateConflict: body?.error === 'ILLEGAL_STATE_TRANSITION',
  };
}
