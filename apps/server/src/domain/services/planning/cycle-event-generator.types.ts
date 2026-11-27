import type { CalendarDay, Instant, TimeOfDay } from '@church/time';
import type {
  EventId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../../branded-ids';
import type { Cycle } from '../../entities/cycle';
import type { EventTemplate } from '../../entities/event-template';
import type { PrecedencePair } from './template-precedence-application.types';

export interface ExistingGeneratedEventTimeBlockFingerprint {
  eventDate: CalendarDay;
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
}

export interface ExistingGeneratedEvent {
  eventId: EventId;
  eventDate: CalendarDay;
  sourceTemplateId?: EventTemplateId;
  /** A legacy cancelled copy still occupies its slot but is never revived. */
  cancelled?: boolean;
}

export interface GenerateCycleEventsInput {
  cycle: Cycle;
  templates: EventTemplate[];
  existingEvents: ExistingGeneratedEvent[];
  existingFingerprints: ExistingGeneratedEventTimeBlockFingerprint[];
  timeZone: string;
  /** Answers other than "both"; a loser skips its blocks that overlap its winner's. */
  precedencePairs?: PrecedencePair[];
}

export interface GeneratedCycleEventTimeBlockPlan {
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  label: string;
  isPublic: boolean;
  place?: string;
  placeAddressId?: string;
  startTime: Instant;
  endTime: Instant;
}

export interface GeneratedCycleCreateEventPlan {
  kind: 'create_event';
  sourceTemplateId: EventTemplateId;
  title: string;
  start: Instant;
  end: Instant;
  eventTimeBlocks: GeneratedCycleEventTimeBlockPlan[];
}

export interface GeneratedCycleAppendEventTimeBlockPlan {
  kind: 'append_event_time_blocks';
  eventId: EventId;
  eventTimeBlocks: GeneratedCycleEventTimeBlockPlan[];
}

export type GeneratedCycleEventPlan =
  | GeneratedCycleCreateEventPlan
  | GeneratedCycleAppendEventTimeBlockPlan;

export interface BuildEventTimeBlockBoundsInput {
  date: CalendarDay;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  timeZone: string;
}

export interface EventTimeBlockBounds {
  startTime: Instant;
  endTime: Instant;
}

export interface EventTimeBlockEnvelope {
  start: Instant;
  end: Instant;
}

export interface EventTimeBlockEnvelopeInput {
  eventTimeBlocks: EventTimeBlockBounds[];
}
