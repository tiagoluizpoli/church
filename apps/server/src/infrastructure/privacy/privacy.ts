// biome-ignore-all lint/style/useNamingConvention: Sentry event fields are snake_case on the wire
import { z } from 'zod';

/**
 * The one server privacy module (ADR 0014). Framework-free so log shipping and
 * error-report scrubbing share the same URL and header rules.
 */

const MASK = ':redacted';

// Every route with a secret in its path. A new such route must be added here.
// - Better Auth: GET /api/auth/reset-password/:token (password-reset callback)
// - Redemption: /redemption/{church,ministry,transfer}/:invitationId, the
//   emailed invitation link's bearer id (and its /accept, /redeem, ... children)
// - Web pages /invitations/{church,ministry}/:invitationId, the same bearer id
//   in the page URL a browser crash report carries
const TOKEN_SEGMENTS: readonly RegExp[] = [
  /(\/reset-password\/)[^/]+/,
  /(\/redemption\/(?:church|ministry|transfer)\/)[^/]+/,
  /(\/invitations\/(?:church|ministry)\/)[^/]+/,
];

// Headers carry no identity beyond these; cookie, authorization and referer
// (which can hold a query string) are never allowed.
const ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'content-length',
  'content-type',
  'host',
  'origin',
  'user-agent',
  'x-request-id',
]);

export interface RedactUrlInput {
  url: string;
}

/** The route path only: no query string or fragment, token segments masked. */
export function redactUrl({ url }: RedactUrlInput): string {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return TOKEN_SEGMENTS.reduce(
    (result, pattern) => result.replace(pattern, `$1${MASK}`),
    path,
  );
}

export interface AllowedHeadersInput {
  headers: Record<string, unknown>;
}

/** Only allowlisted headers. */
export function allowedHeaders({
  headers,
}: AllowedHeadersInput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      ALLOWED_HEADERS.has(name.toLowerCase()),
    ),
  );
}

interface LoggedRequest {
  method: string;
  url: string;
  headers: Record<string, unknown>;
}

/** pino `req` serializer: method, masked path, allowlisted headers. No IP, no body. */
export function serializeRequest(request: LoggedRequest) {
  return {
    method: request.method,
    url: redactUrl({ url: request.url }),
    headers: allowedHeaders({ headers: request.headers }),
  };
}

// Report tags carry ids and deployment facts only.
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'environment',
  'revision',
  'trace_id',
  'church_id',
  'outbox_message_id',
  'outbox_kind',
]);

// Zod drops unknown keys, so each schema is the allowlist: the exception
// value, message, breadcrumbs, extra, frame vars, user email/IP/name, request
// body, cookies and query string never pass.
// Browser frame paths are asset URLs; their query string is dropped.
const framePath = z
  .string()
  .transform((url) => redactUrl({ url }))
  .optional();

const frameSchema = z.object({
  filename: framePath,
  abs_path: framePath,
  module: z.string().optional(),
  function: z.string().optional(),
  lineno: z.number().optional(),
  colno: z.number().optional(),
  in_app: z.boolean().optional(),
});

const reportEventSchema = z.object({
  event_id: z.string().optional(),
  timestamp: z.number().optional(),
  level: z.string().optional(),
  platform: z.string().optional(),
  environment: z.string().optional(),
  release: z.string().optional(),
  tags: z.record(z.string(), z.unknown()).optional(),
  user: z.object({ id: z.string().optional() }).optional(),
  request: z
    .object({
      method: z.string().optional(),
      url: z.string().optional(),
      headers: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  exception: z
    .object({
      values: z.array(
        z.object({
          type: z.string().optional(),
          mechanism: z
            .object({ type: z.string(), handled: z.boolean().optional() })
            .optional(),
          stacktrace: z.object({ frames: z.array(frameSchema) }).optional(),
        }),
      ),
    })
    .optional(),
  contexts: z
    .object({
      trace: z
        .object({ trace_id: z.string(), span_id: z.string().optional() })
        .optional(),
    })
    .optional(),
});

export type ScrubbedEvent = z.infer<typeof reportEventSchema>;

export interface ScrubEventInput {
  event: unknown;
}

/**
 * An error-tracker event reduced to ids, error type and stack (ADR 0014), or
 * null when it isn't a well-formed event. Server reports and forwarded
 * browser reports both pass through here.
 */
export function scrubEvent({ event }: ScrubEventInput): ScrubbedEvent | null {
  const parsed = reportEventSchema.safeParse(event);
  if (!parsed.success) return null;
  const { tags, request, ...rest } = parsed.data;
  return {
    ...rest,
    ...(tags && {
      tags: Object.fromEntries(
        Object.entries(tags).filter(([name]) => ALLOWED_TAGS.has(name)),
      ),
    }),
    ...(request && {
      request: {
        ...(request.method && { method: request.method }),
        ...(request.url && { url: redactUrl({ url: request.url }) }),
        ...(request.headers && {
          headers: allowedHeaders({ headers: request.headers }),
        }),
      },
    }),
  };
}
