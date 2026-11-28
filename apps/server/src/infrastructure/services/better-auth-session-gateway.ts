import type { Auth } from '@church/auth';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type {
  CallerSession,
  LookupSessionInput,
  SessionGateway,
  SetSessionActiveChurchInput,
} from '../../domain/contracts/infrastructure/session-gateway';
import type { BetterAuthSessionGatewayInput } from './better-auth-session-gateway.types';

export class BetterAuthSessionGateway implements SessionGateway {
  private readonly auth: Auth;

  constructor({ auth }: BetterAuthSessionGatewayInput) {
    this.auth = auth;
  }

  async lookup({ headers }: LookupSessionInput): Promise<CallerSession | null> {
    const session = await this.auth.api
      .getSession({ headers })
      .catch(() => null);
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
