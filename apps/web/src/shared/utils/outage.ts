import { isAxiosError } from 'axios';

const OUTAGE_STATUSES = new Set([502, 503, 504]);

/** A shell-level call (the session check) that failed because the server could not be reached. */
export class OutageError extends Error {
  constructor(options?: ErrorOptions) {
    super('The server could not be reached', options);
    this.name = 'OutageError';
  }
}

/** An HTTP status (0 or missing: no response) that means the server is unreachable. */
function isOutageStatus(status: number | undefined): boolean {
  return !status || OUTAGE_STATUSES.has(status);
}

/** No response, or a gateway/unavailable status: the server will come back, so wait. */
export function isOutageError(error: unknown): boolean {
  if (error instanceof OutageError) return true;
  if (!isAxiosError(error)) return false;
  return isOutageStatus(error.response?.status);
}

/**
 * The session guard's stricter rule (ADR 0016): no response or any 5xx says
 * nothing about who is signed in, so only a successful "no session" answer
 * may send the user to login.
 */
export function isFailedSessionStatus(status: number | undefined): boolean {
  return !status || status >= 500;
}
