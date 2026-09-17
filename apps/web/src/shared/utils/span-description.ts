import { compareInstants, type Instant, type Span } from '@church/time';

export interface IsInvalidInstantRangeInput {
  start: Instant;
  end: Instant;
}

/** True when `end` is not strictly after `start` — the shared "end must be
 * after start" guard behind every Instant start/end pair in the
 * planning-admin and tailoring dialogs. */
export function isInvalidInstantRange({
  start,
  end,
}: IsInvalidInstantRangeInput): boolean {
  return compareInstants({ left: start, right: end }) !== -1;
}

interface FormatSpanDurationInput {
  durationMinutes: number;
}

function formatSpanDuration({ durationMinutes }: FormatSpanDurationInput) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export interface DescribeSpanInput {
  span: Span;
}

/** `Runs 4h · ends next day` for a span whose end crosses midnight, or
 * `Runs 30m` for a same-day span (ADR-0003's computed-span confirmation). */
export function describeSpan({ span }: DescribeSpanInput): string {
  const duration = formatSpanDuration({
    durationMinutes: span.durationMinutes,
  });

  return span.crossesToNextDay
    ? `Runs ${duration} · ends next day`
    : `Runs ${duration}`;
}
