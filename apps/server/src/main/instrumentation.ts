// Preloaded before the server (`bun --preload`), so pg is patched before it
// is first imported. Bun has no ESM loader hooks; this setup is verified by
// tests/http/tracing.http.test.ts (ADR 0015).
import { env } from '@church/env/server';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { redactUrl } from '../infrastructure/privacy/privacy';
import { requestTraceIds } from './fastify/request-id';

const URL_PATH = 'url.path';

/** Registered explicitly by `createFastify` before routes: its
 * self-registration mode produces no spans under Bun. */
export const fastifyOtel = new FastifyOtelInstrumentation({
  // The default url.path is the raw URL, query string and tokens included.
  requestHook: (span, request) => {
    span.setAttribute(URL_PATH, redactUrl({ url: request.url }));
  },
});

const { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint, TRACE_SAMPLE_RATE } = env;

if (endpoint) {
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(TRACE_SAMPLE_RATE),
  });
  new NodeSDK({
    serviceName: 'church-server',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    sampler,
    idGenerator: requestTraceIds,
    instrumentations: [
      // Query text only: enhanced reporting would record parameter values.
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      fastifyOtel,
    ],
  }).start();
}
