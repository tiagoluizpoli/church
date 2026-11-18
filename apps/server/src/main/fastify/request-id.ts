import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

// W3C traceparent, version 00: trace id and parent id lowercase hex, neither all zeros.
const TRACEPARENT =
  /^00-(?!0{32})([0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;

interface RequestIdInput {
  headers: IncomingHttpHeaders;
}

/**
 * The request id is the W3C trace id: the incoming `traceparent`'s when it is
 * valid, else a fresh one. Fastify's `genReqId` (it takes the raw request).
 */
export function requestId({ headers }: RequestIdInput): string {
  const traceparent = headers.traceparent;
  const match =
    typeof traceparent === 'string' ? TRACEPARENT.exec(traceparent) : null;
  return match?.[1] ?? randomBytes(16).toString('hex');
}
