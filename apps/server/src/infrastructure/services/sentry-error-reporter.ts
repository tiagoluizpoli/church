import * as Sentry from '@sentry/bun';
import type {
  ErrorReport,
  ErrorReporter,
} from '../../domain/contracts/infrastructure/error-reporter';
import { scrubEvent } from '../privacy/privacy';

export interface InitErrorReportingInput {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  revision: string;
  /** Tests capture envelopes in memory instead of sending them. */
  transport?: Sentry.BunOptions['transport'];
}

/**
 * Errors only: no tracing, no default integrations (reports are captured
 * explicitly), and every event goes through the privacy scrubber. Off unless
 * a DSN is set and the switch is on. Returns the DSN reports go to, or
 * undefined while reporting is off: the one place that rule lives.
 */
export function initErrorReporting({
  dsn,
  enabled,
  environment,
  revision,
  transport,
}: InitErrorReportingInput): string | undefined {
  if (!(dsn && enabled)) return undefined;
  Sentry.init({
    dsn,
    environment,
    release: revision,
    transport,
    enableOpenTelemetrySetup: false,
    defaultIntegrations: false,
    initialScope: { tags: { environment, revision } },
    // The scrubbed event is a field subset of the SDK's own event.
    beforeSend: (event) => scrubEvent({ event }) as Sentry.ErrorEvent | null,
  });
  return dsn;
}

export class SentryErrorReporter implements ErrorReporter {
  report({
    error,
    traceId,
    userId,
    churchId,
    request,
    tags,
  }: ErrorReport): void {
    Sentry.withScope((scope) => {
      if (traceId) {
        // The event's trace context names the same trace as the tag.
        scope.setPropagationContext({ traceId, sampleRand: Math.random() });
        scope.setTag('trace_id', traceId);
      }
      if (churchId) scope.setTag('church_id', churchId);
      if (userId) scope.setUser({ id: userId });
      if (tags) scope.setTags(tags);
      // Raw request facts; beforeSend's scrubber trims them before sending.
      const requestData = request as Sentry.RequestEventData | undefined;
      if (requestData) {
        scope.addEventProcessor((event) => ({
          ...event,
          request: requestData,
        }));
      }
      Sentry.captureException(error);
    });
  }
}
