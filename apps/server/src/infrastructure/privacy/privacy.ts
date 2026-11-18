/**
 * The one server privacy module (ADR 0014). Framework-free so log shipping and
 * error-report scrubbing share the same URL and header rules.
 */

const MASK = ':redacted';

// Every route with a secret in its path. A new such route must be added here.
// - Better Auth: GET /api/auth/reset-password/:token (password-reset callback)
// - Redemption: /redemption/{church,ministry,transfer}/:invitationId, the
//   emailed invitation link's bearer id (and its /accept, /redeem, ... children)
const TOKEN_SEGMENTS: readonly RegExp[] = [
  /(\/reset-password\/)[^/]+/,
  /(\/redemption\/(?:church|ministry|transfer)\/)[^/]+/,
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
