import { randomBytes } from 'node:crypto';
import type { RequestIdInput } from './request-id.types';

// W3C traceparent, version 00: trace id and parent id lowercase hex, neither all zeros.
const TRACEPARENT =
  /^00-(?!0{32})([0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

// Fastify calls the first onRequest hook (the request span's) synchronously
// after genReqId, so the root span takes this id before any other root span.
// shortcut: relies on that synchronous handoff in one process; if a root span
// could start between genReqId and the hook, carry the id on the request instead.
let freshTraceId: string | undefined;

/**
 * The request id is the W3C trace id: the incoming `traceparent`'s when it is
 * valid, else a fresh one that the request span then takes as its trace id
 * (see `requestTraceIds`). Fastify's `genReqId` (it takes the raw request).
 */
export function requestId({ headers }: RequestIdInput): string {
  const { traceparent } = headers;
  const match =
    typeof traceparent === 'string' ? TRACEPARENT.exec(traceparent) : null;
  if (match?.[1]) return match[1];
  // A traceparent rejected here must not parent the request span either.
  delete headers.traceparent;
  freshTraceId = randomBytes(TRACE_ID_BYTES).toString('hex');
  return freshTraceId;
}

/** The tracer's id generator: a root span right after `requestId` takes its
 * fresh id, so the request span's trace id is the request id. */
export const requestTraceIds = {
  generateTraceId(): string {
    const id = freshTraceId ?? randomBytes(TRACE_ID_BYTES).toString('hex');
    freshTraceId = undefined;
    return id;
  },
  generateSpanId(): string {
    return randomBytes(SPAN_ID_BYTES).toString('hex');
  },
};
