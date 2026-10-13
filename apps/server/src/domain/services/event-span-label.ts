import type { Instant } from '@church/time';

export const EVENT_SPAN_LABELS = ['hourly', 'day_based'] as const;
export type EventSpanLabel = (typeof EVENT_SPAN_LABELS)[number];

export interface EventSpanLabelInput {
  start: Instant;
  end: Instant;
}

/** Label key for an Event derived from its span: a start and end on the same
 * UTC date is `hourly`, otherwise `day_based`. Translation comes later. */
export function eventSpanLabel({
  start,
  end,
}: EventSpanLabelInput): EventSpanLabel {
  return start.slice(0, 10) === end.slice(0, 10) ? 'hourly' : 'day_based';
}
