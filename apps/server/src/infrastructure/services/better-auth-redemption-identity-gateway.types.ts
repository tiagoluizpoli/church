import type { Auth, CreateAuthInput } from '@church/auth';

export type TransactionAuthFactoryInput = Pick<CreateAuthInput, 'database'>;

export type TransactionAuthFactory = (
  input: TransactionAuthFactoryInput,
) => Auth;

export interface BetterAuthRedemptionIdentityGatewayInput {
  /** The request-serving instance. */
  auth: Auth;
  /** Builds the same configuration over a transaction. */
  createTransactionAuth: TransactionAuthFactory;
}
