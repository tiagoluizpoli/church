import type * as Sentry from '@sentry/bun';

export interface InitErrorReportingInput {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  revision: string;
  /** Tests capture envelopes in memory instead of sending them. */
  transport?: Sentry.BunOptions['transport'];
}
