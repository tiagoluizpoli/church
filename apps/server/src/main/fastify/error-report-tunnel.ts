import type { AppConfig } from '@church/app-config';
import type { FastifyInstance } from 'fastify';
import { isRateLimited } from '../../api/utils/rate-limit';
import {
  type EnvelopeRefusal,
  envelopeUrl,
  forwardEnvelope,
  parseErrorEnvelope,
} from '../../infrastructure/services/error-report-tunnel';

export const ERROR_REPORT_TUNNEL_PATH = '/api/error-reports';

const ACCEPTED = 202;
const NO_CONTENT = 204;
const TOO_MANY_REQUESTS = 429;
// One browser event plus its stack; anything larger is not a crash report.
const BODY_LIMIT_BYTES = 256 * 1024;

const REFUSAL_STATUS: Record<EnvelopeRefusal, number> = {
  malformed: 400,
  notError: 400,
  foreignDsn: 403,
};

export interface RegisterErrorReportTunnelInput {
  app: FastifyInstance;
  /** Our DSN, or undefined while error reporting is off. */
  dsn: string | undefined;
  /** CHURCH_ENVIRONMENT; the web app reports under it. */
  environment: string;
  settings: AppConfig['errorReportTunnel'];
}

/**
 * The browser SDK's `tunnel`: web and desktop crash reports reach the tracker
 * (over the tailnet) only through here, scrubbed under ADR 0014. The answer
 * never waits for the tracker. While reporting is off it answers 204 and
 * drops the report: nothing is relayed, and a web build that still reports
 * gets no error to retry or log. A GET answers the web SDK's settings, or
 * 204 while off.
 */
export function registerErrorReportTunnel({
  app,
  dsn,
  environment,
  settings,
}: RegisterErrorReportTunnelInput): void {
  const { windowMs, maxRequests, forwardTimeoutMs } = settings;
  const url = dsn && envelopeUrl({ dsn });

  // The web image is built once for every environment, so it learns the DSN
  // and environment here at runtime. The DSN's host is tailnet-only.
  app.get(
    ERROR_REPORT_TUNNEL_PATH,
    { schema: { hide: true } },
    (_request, reply) =>
      dsn ? reply.send({ dsn, environment }) : reply.code(NO_CONTENT).send(),
  );

  app.post(
    ERROR_REPORT_TUNNEL_PATH,
    { bodyLimit: BODY_LIMIT_BYTES, schema: { hide: true } },
    async (request, reply) => {
      if (!(dsn && url)) return reply.code(NO_CONTENT).send();
      const key = `error-report:${request.ip}`;
      if (isRateLimited({ key, windowMs, maxRequests })) {
        return reply.code(TOO_MANY_REQUESTS).send();
      }
      const outcome = parseErrorEnvelope({ body: request.body, dsn });
      if (!outcome.accepted) {
        request.log.warn({ refusal: outcome.refusal }, 'Error report refused');
        return reply.code(REFUSAL_STATUS[outcome.refusal]).send();
      }
      forwardEnvelope({
        url,
        envelope: outcome.envelope,
        timeoutMs: forwardTimeoutMs,
        onFailure: (error) =>
          request.log.warn({ err: error }, 'Error report forwarding failed'),
      });
      return reply.code(ACCEPTED).send();
    },
  );
}
