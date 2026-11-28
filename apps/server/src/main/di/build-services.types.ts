import type { CompositionRootDependencies } from './dependencies.types';

export type Services = Pick<
  CompositionRootDependencies,
  | 'redemptionIdentityGateway'
  | 'sessionGateway'
  | 'emailSender'
  | 'errorReporter'
  | 'tracing'
  | 'objectStorage'
  | 'webShell'
> &
  // Absent unless the sender is capture.
  Partial<Pick<CompositionRootDependencies, 'verificationCodeInspector'>>;

export interface BuildServicesInput {
  overrides: Partial<CompositionRootDependencies>;
}
