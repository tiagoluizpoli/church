import { auth } from '@church/auth';
import { injectable } from 'tsyringe';
import { z } from 'zod';
import { UserId } from '../../domain/branded-ids';
import type {
  AcceptChurchInvitationInput,
  CreateRedemptionAccountInput,
  CreateRedemptionAccountOutput,
  RedemptionIdentityGateway,
  RejectChurchInvitationInput,
  SetActiveRedemptionChurchInput,
} from '../../domain/contracts/infrastructure/redemption-identity-gateway';

const signInResponseSchema = z.object({
  user: z.object({ id: z.string() }),
});

@injectable()
export class BetterAuthRedemptionIdentityGateway
  implements RedemptionIdentityGateway
{
  async createAccount({
    email,
    name,
    password,
  }: CreateRedemptionAccountInput): Promise<CreateRedemptionAccountOutput> {
    let userId: string;
    try {
      const account = await auth.api.signUpEmail({
        body: { email, name, password },
      });
      userId = account.user.id;
    } catch {
      // A retry may resume after the account checkpoint completed but before
      // the Ministry Invitation transaction did. The password still proves
      // ownership of the invitation email before a new browser session exists.
      const session = await this.createAuthenticatedSession({
        email,
        password,
      });
      return {
        userId: UserId.from(session.userId),
        sessionCookie: session.cookie,
      };
    }
    const session = await this.createAuthenticatedSession({ email, password });
    return {
      userId: UserId.from(userId),
      sessionCookie: session.cookie,
    };
  }

  async acceptChurchInvitation({
    churchInvitationId,
    sessionCookie,
  }: AcceptChurchInvitationInput): Promise<void> {
    await auth.api.acceptInvitation({
      headers: new Headers({ cookie: sessionCookie }),
      body: { invitationId: churchInvitationId },
    });
  }

  async rejectChurchInvitation({
    churchInvitationId,
    sessionCookie,
  }: RejectChurchInvitationInput): Promise<void> {
    await auth.api.rejectInvitation({
      headers: new Headers({ cookie: sessionCookie }),
      body: { invitationId: churchInvitationId },
    });
  }

  async setActiveChurch({
    churchId,
    sessionCookie,
  }: SetActiveRedemptionChurchInput): Promise<void> {
    await auth.api.setActiveOrganization({
      headers: new Headers({ cookie: sessionCookie }),
      body: { organizationId: churchId },
    });
  }

  private async createAuthenticatedSession({
    email,
    password,
  }: CreateAuthenticatedSessionInput): Promise<AuthenticatedSession> {
    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    const cookie = response.headers.get('set-cookie');
    const responseBody = signInResponseSchema.safeParse(await response.json());
    if (!response.ok || !cookie || !responseBody.success)
      throw new Error('Better Auth did not create a session cookie.');
    return {
      userId: responseBody.data.user.id,
      cookie,
    };
  }
}

interface CreateAuthenticatedSessionInput {
  email: string;
  password: string;
}

interface AuthenticatedSession {
  userId: string;
  cookie: string;
}
