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

/** The caller's auth session. `lookup` answers null when there is none (a 401). */
export interface SessionGateway {
  lookup(input: LookupSessionInput): Promise<CallerSession | null>;
  setActiveChurch(input: SetSessionActiveChurchInput): Promise<void>;
}
