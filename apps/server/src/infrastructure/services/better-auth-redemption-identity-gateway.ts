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
  VerifyPasswordInput,
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

  async verifyPassword({
    email,
    password,
  }: VerifyPasswordInput): Promise<boolean> {
    // Spec §8.7 layer 3: prove the password server-side without leaving a new
    // session behind. Better Auth's `sign-in/email` is the only credential
    // check available, and — with the database session strategy this app
    // uses — it persists a session row as a side effect of success, before
    // any cookie is returned. Discarding the `set-cookie` only stops the
    // *caller* from ever holding that session; the row would otherwise sit
    // valid and unused until it expires. So a successful check immediately
    // signs that session back out, deleting the row, before reporting true.
    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    if (!response.ok) return false;
    const cookie = response.headers.get('set-cookie');
    if (cookie) {
      await auth.handler(
        new Request('http://localhost/api/auth/sign-out', {
          method: 'POST',
          headers: { cookie },
        }),
      );
    }
    return true;
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
