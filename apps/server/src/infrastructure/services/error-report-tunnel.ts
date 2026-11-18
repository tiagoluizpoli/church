// biome-ignore-all lint/style/useNamingConvention: Sentry envelope fields are snake_case on the wire
import { scrubEvent } from '../privacy/privacy';

export type EnvelopeRefusal = 'malformed' | 'foreignDsn' | 'notError';

/** The scrubbed envelope to forward. */
export interface AcceptedEnvelope {
  accepted: true;
  envelope: string;
}

export interface RefusedEnvelope {
  accepted: false;
  refusal: EnvelopeRefusal;
}

export type ErrorEnvelopeOutcome = AcceptedEnvelope | RefusedEnvelope;

export interface ParseErrorEnvelopeInput {
  body: unknown;
  /** Our own DSN; an envelope addressed to any other is refused. */
  dsn: string;
}

function parseJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const refuse = (refusal: EnvelopeRefusal): ErrorEnvelopeOutcome => ({
  accepted: false,
  refusal,
});

/**
 * A browser SDK envelope reduced to the one scrubbed error event it may carry
 * (ADR 0014). Exactly one `event` item with an exception is accepted:
 * transactions, replays, sessions, attachments and messages are refused, and
 * the envelope's own header loses its trace context (it can name the route).
 */
export function parseErrorEnvelope({
  body,
  dsn,
}: ParseErrorEnvelopeInput): ErrorEnvelopeOutcome {
  if (typeof body !== 'string') return refuse('malformed');
  const [headerLine, itemHeaderLine, payloadLine, ...rest] = body
    .split('\n')
    .filter((line) => line.trim() !== '');
  const header = parseJson(headerLine);
  if (!isRecord(header)) return refuse('malformed');
  if (header.dsn !== dsn) return refuse('foreignDsn');

  const itemHeader = parseJson(itemHeaderLine);
  const payload = parseJson(payloadLine);
  const isErrorEvent =
    rest.length === 0 &&
    isRecord(itemHeader) &&
    itemHeader.type === 'event' &&
    isRecord(payload) &&
    payload.type === undefined;
  if (!isErrorEvent) return refuse('notError');

  const event = scrubEvent({ event: payload });
  if (!event?.exception?.values.length) return refuse('notError');

  const { event_id, sent_at } = header;
  const envelope = [
    JSON.stringify({ event_id, sent_at, dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
  return { accepted: true, envelope };
}

export interface EnvelopeUrlInput {
  dsn: string;
}

/** The tracker's envelope endpoint for a DSN `scheme://key@host[/path]/project`. */
export function envelopeUrl({ dsn }: EnvelopeUrlInput): string {
  const { protocol, host, pathname, username } = new URL(dsn);
  const segments = pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  const prefix = segments.map((segment) => `/${segment}`).join('');
  return `${protocol}//${host}${prefix}/api/${projectId}/envelope/?sentry_key=${username}`;
}

export interface ForwardEnvelopeInput {
  url: string;
  envelope: string;
  timeoutMs: number;
  onFailure: (error: unknown) => void;
}

/** Fire-and-forget: never awaited by the caller, aborted after `timeoutMs`. */
export function forwardEnvelope({
  url,
  envelope,
  timeoutMs,
  onFailure,
}: ForwardEnvelopeInput): void {
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body: envelope,
    signal: AbortSignal.timeout(timeoutMs),
  })
    .then(async (response) => {
      // Drain the body so the connection is released.
      await response.arrayBuffer();
      if (!response.ok)
        onFailure(new Error(`tracker answered ${response.status}`));
    })
    .catch(onFailure);
}
