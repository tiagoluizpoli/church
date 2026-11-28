import type { ChurchId, UserId } from '../../branded-ids';

export interface LookupSessionInput {
  /** The request's headers, cookie included, as the auth backend reads them. */
  headers: Headers;
}

/** The signed-in caller as the session names them. */
export interface CallerSession {
  userId: UserId;
  /** The Church the session has active; null before any is chosen. */
  activeOrganizationId: ChurchId | null;
}

export interface SetSessionActiveChurchInput {
  headers: Headers;
  /** null clears the session's active Church. */
  churchId: ChurchId | null;
}

/**
 * The caller's auth session. `lookup` answers null only for a missing or
 * refused session (a 401); an auth-backend failure throws
 * `AuthBackendUnavailableError`, which the error handler answers with 503.
 */
export interface SessionGateway {
  lookup(input: LookupSessionInput): Promise<CallerSession | null>;
  setActiveChurch(input: SetSessionActiveChurchInput): Promise<void>;
}
