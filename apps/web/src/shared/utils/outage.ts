import { isAxiosError } from 'axios';

const OUTAGE_STATUSES = new Set([502, 503, 504]);

/** No response, or a gateway/unavailable status: the server will come back, so wait. */
export function isOutageError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || OUTAGE_STATUSES.has(status);
}
