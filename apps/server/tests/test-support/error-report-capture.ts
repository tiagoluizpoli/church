import { createTransport, flush } from '@sentry/bun';
import {
  initErrorReporting,
  SentryErrorReporter,
} from '@/infrastructure/services/sentry-error-reporter';

export const REPORT_ENVIRONMENT = 'staging';
export const REPORT_REVISION = 'rev-test';

/** The production reporter; it sends nothing until `captureErrorReports` runs. */
export const testErrorReporter = new SentryErrorReporter();

export interface CapturedReports {
  /** Raw envelopes, for "never contains" checks. */
  envelopes: string[];
  /** The error events inside them. */
  events: Record<string, unknown>[];
  /** Waits for queued reports, then returns the events. */
  settle(): Promise<Record<string, unknown>[]>;
  clear(): void;
}

/** Turns error reporting on with an in-memory transport (no network). */
export function captureErrorReports(): CapturedReports {
  const envelopes: string[] = [];
  const events: Record<string, unknown>[] = [];
  initErrorReporting({
    dsn: 'https://public@tracker.test/1',
    enabled: true,
    environment: REPORT_ENVIRONMENT,
    revision: REPORT_REVISION,
    transport: (options) =>
      createTransport(options, async ({ body }) => {
        const text =
          typeof body === 'string' ? body : new TextDecoder().decode(body);
        envelopes.push(text);
        // Envelope lines: header, then item-header/payload pairs.
        const [, ...items] = text.split('\n').filter(Boolean);
        for (let index = 0; index < items.length; index += 2) {
          const itemHeader = JSON.parse(items[index] ?? '{}');
          if (itemHeader.type === 'event') {
            events.push(JSON.parse(items[index + 1] ?? '{}'));
          }
        }
        return { statusCode: 200 };
      }),
  });
  return {
    envelopes,
    events,
    async settle() {
      await flush();
      return events;
    },
    clear() {
      envelopes.length = 0;
      events.length = 0;
    },
  };
}
