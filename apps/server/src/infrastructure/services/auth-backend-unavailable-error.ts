import type { AuthBackendUnavailableErrorInput } from './auth-backend-unavailable-error.types';

/**
 * The auth backend failed to answer a session lookup. Not a DomainError: the
 * error handler answers it with the same 503 as a database outage, so a
 * transient failure never reads as a sign-out.
 */
export class AuthBackendUnavailableError extends Error {
  override readonly name = 'AuthBackendUnavailableError';

  constructor({ cause }: AuthBackendUnavailableErrorInput) {
    super('The auth backend could not look up the session', { cause });
  }
}
