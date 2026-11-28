import type { Auth } from '@church/auth';
import { isAPIError } from 'better-auth/api';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type {
  CallerSession,
  LookupSessionInput,
  SessionGateway,
  SetSessionActiveChurchInput,
} from '../../domain/contracts/infrastructure/session-gateway';
import { AuthBackendUnavailableError } from './auth-backend-unavailable-error';
import type { BetterAuthSessionGatewayInput } from './better-auth-session-gateway.types';

const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

/** Better Auth's own 4xx: it refused this session, so there is none. */
function isSessionRefusal(error: unknown): boolean {
  return (
    isAPIError(error) &&
    error.statusCode >= CLIENT_ERROR_MIN &&
    error.statusCode < SERVER_ERROR_MIN
  );
}

export class BetterAuthSessionGateway implements SessionGateway {
  private readonly auth: Auth;

  constructor({ auth }: BetterAuthSessionGatewayInput) {
    this.auth = auth;
  }

  async lookup({ headers }: LookupSessionInput): Promise<CallerSession | null> {
    const session = await this.auth.api
      .getSession({ headers })
      .catch((error: unknown) => {
        // A refusal reads as no session (401); only an outage (a 5xx or an
        // unexpected throw, such as a network failure) is a 503.
        if (isSessionRefusal(error)) return null;
        throw new AuthBackendUnavailableError({ cause: error });
      });
    if (!session?.user) return null;
    const { activeOrganizationId } = session.session;
    return {
      userId: UserId.from(session.user.id),
      activeOrganizationId: activeOrganizationId
        ? ChurchId.from(activeOrganizationId)
        : null,
    };
  }

  async setActiveChurch({
    headers,
    churchId,
  }: SetSessionActiveChurchInput): Promise<void> {
    await this.auth.api.setActiveOrganization({
      headers,
      body: { organizationId: churchId },
    });
  }
}
