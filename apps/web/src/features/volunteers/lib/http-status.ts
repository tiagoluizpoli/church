import { isAxiosError } from 'axios';

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function statusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** A swap request refusal: 409 (not allowed in the current state). */
export function isConflict(error: unknown): boolean {
  return statusOf(error) === HTTP_CONFLICT;
}

/** The raise is stale when refused (409) or when the Assignment is gone (404). */
export function isStaleRaise(error: unknown): boolean {
  return isConflict(error) || statusOf(error) === HTTP_NOT_FOUND;
}
