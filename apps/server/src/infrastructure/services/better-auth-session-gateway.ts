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

const UNAUTHORIZED = 401;

export class BetterAuthSessionGateway implements SessionGateway {
  private readonly auth: Auth;

  constructor({ auth }: BetterAuthSessionGatewayInput) {
    this.auth = auth;
  }

  async lookup({ headers }: LookupSessionInput): Promise<CallerSession | null> {
    const session = await this.auth.api
      .getSession({ headers })
      .catch((error: unknown) => {
        // Better Auth refuses a session it cannot refresh with its own 401.
        if (isAPIError(error) && error.statusCode === UNAUTHORIZED) return null;
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
