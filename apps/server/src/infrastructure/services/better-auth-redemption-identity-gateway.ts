import type { Auth, CreateAuthInput } from '@church/auth';
import { UserId } from '../../domain/branded-ids';
import type {
  AcceptChurchInvitationInput,
  CreateRedemptionAccountInput,
  CreateRedemptionAccountOutput,
  IsEmailRegisteredInput,
  RedemptionIdentityGateway,
  RejectChurchInvitationInput,
  SetActiveRedemptionChurchInput,
  VerifyPasswordInput,
} from '../../domain/contracts/infrastructure/redemption-identity-gateway';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import { DrizzleTransactionContext } from '../repositories/drizzle-transaction-context';

export type TransactionAuthFactoryInput = Pick<CreateAuthInput, 'database'>;

export type TransactionAuthFactory = (
  input: TransactionAuthFactoryInput,
) => Auth;

interface BetterAuthRedemptionIdentityGatewayInput {
  /** The request-serving instance. */
  auth: Auth;
  /** Builds the same configuration over a transaction. */
  createTransactionAuth: TransactionAuthFactory;
}

interface AuthForInput {
  tx?: TransactionContext;
}

export class BetterAuthRedemptionIdentityGateway
  implements RedemptionIdentityGateway
{
  private readonly auth: Auth;
  private readonly createTransactionAuth: TransactionAuthFactory;
  /** One transaction-bound instance per open transaction. */
  private readonly transactionAuth = new WeakMap<object, Auth>();

  constructor({
    auth,
    createTransactionAuth,
  }: BetterAuthRedemptionIdentityGatewayInput) {
    this.auth = auth;
    this.createTransactionAuth = createTransactionAuth;
  }

  async createAccount({
    email,
    name,
    password,
    tx,
  }: CreateRedemptionAccountInput): Promise<CreateRedemptionAccountOutput> {
    // Sign-up also opens the session (auto sign-in); an existing User is
    // refused here rather than signed in with the supplied password.
    const { headers, response } = await this.authFor({ tx }).api.signUpEmail({
      body: { email, name, password },
      returnHeaders: true,
    });
    const sessionCookie = headers.get('set-cookie');
    if (!sessionCookie)
      throw new Error('Better Auth did not create a session cookie.');
    return { userId: UserId.from(response.user.id), sessionCookie };
  }

  async acceptChurchInvitation({
    churchInvitationId,
    sessionCookie,
    tx,
  }: AcceptChurchInvitationInput): Promise<void> {
    await this.authFor({ tx }).api.acceptInvitation({
      headers: new Headers({ cookie: sessionCookie }),
      body: { invitationId: churchInvitationId },
    });
  }

  async rejectChurchInvitation({
    churchInvitationId,
    sessionCookie,
  }: RejectChurchInvitationInput): Promise<void> {
    await this.auth.api.rejectInvitation({
      headers: new Headers({ cookie: sessionCookie }),
      body: { invitationId: churchInvitationId },
    });
  }

  async setActiveChurch({
    churchId,
    sessionCookie,
    tx,
  }: SetActiveRedemptionChurchInput): Promise<void> {
    await this.authFor({ tx }).api.setActiveOrganization({
      headers: new Headers({ cookie: sessionCookie }),
      body: { organizationId: churchId },
    });
  }

  async isEmailRegistered({ email }: IsEmailRegisteredInput): Promise<boolean> {
    const context = await this.auth.$context;
    const found = await context.internalAdapter.findUserByEmail(email);
    return Boolean(found);
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
    const response = await this.auth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    if (!response.ok) return false;
    const cookie = response.headers.get('set-cookie');
    if (cookie) {
      await this.auth.handler(
        new Request('http://localhost/api/auth/sign-out', {
          method: 'POST',
          headers: { cookie },
        }),
      );
    }
    return true;
  }

  private authFor({ tx }: AuthForInput): Auth {
    if (!(tx instanceof DrizzleTransactionContext)) return this.auth;
    const existing = this.transactionAuth.get(tx.tx);
    if (existing) return existing;
    const bound = this.createTransactionAuth({ database: tx.tx });
    this.transactionAuth.set(tx.tx, bound);
    return bound;
  }
}
