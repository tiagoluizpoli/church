import { appConfig } from '@church/app-config';
import { env } from '@church/env/web';
import * as Sentry from '@sentry/react';
import { z } from 'zod';

/** A reference code is this many leading characters of a trace id. */
export const REFERENCE_CODE_LENGTH = 8;

/**
 * The API's error-report tunnel (same origin in the deployed image, absolute
 * for desktop and development). Reports never go to the tracker directly.
 */
export const ERROR_REPORT_TUNNEL_URL = `${env.VITE_SERVER_URL.replace(/\/$/, '')}${appConfig.errorReportTunnel.path}`;

const settingsSchema = z.object({ dsn: z.string(), environment: z.string() });

/**
 * Errors only (ADR 0014): no replay, tracing, sessions, breadcrumbs or client
 * reports; only unhandled rejections are captured globally, and render
 * crashes come from the crash fallback. The web image is built once for every
 * environment, so the DSN and environment come from the API at runtime; it
 * answers 204 while reporting is off (tests, e2e, local), and then nothing
 * here starts.
 */
export async function initErrorReporting(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ERROR_REPORT_TUNNEL_URL);
  } catch {
    return;
  }
  if (response.status !== 200) return;
  const settings = settingsSchema.safeParse(await response.json());
  if (!settings.success) return;
  const { dsn, environment } = settings.data;
  const { VITE_APP_REVISION: revision } = env;
  Sentry.init({
    dsn,
    environment,
    release: revision,
    tunnel: ERROR_REPORT_TUNNEL_URL,
    // Collect nothing personal (SDK v11's replacement for sendDefaultPii).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    sendClientReports: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration({
        onerror: false,
        onunhandledrejection: true,
      }),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
    initialScope: { tags: { environment, revision } },
  });
}

export interface ReportCrashInput {
  error: unknown;
}

/**
 * Reports a render crash under a fresh trace id and returns its reference
 * code (the trace id's first 8 characters, as the tracker stores it), or
 * undefined while reporting is off.
 */
export function reportCrash({ error }: ReportCrashInput): string | undefined {
  if (!Sentry.isEnabled()) return undefined;
  const traceId = crypto.randomUUID().replaceAll('-', '');
  Sentry.withScope((scope) => {
    scope.setPropagationContext({ traceId, sampleRand: Math.random() });
    scope.setTag('trace_id', traceId);
    Sentry.captureException(error, {
      mechanism: { type: 'crash_fallback', handled: true },
    });
  });
  return traceId.slice(0, REFERENCE_CODE_LENGTH);
}
