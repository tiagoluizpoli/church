import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { ROOT } from '../env/ci-workflow';

/**
 * #924: the deployed server only learns its observability settings from the
 * Dokploy env through compose; each one is optional (unset keeps it off).
 */

const compose = Bun.YAML.parse(
  readFileSync(resolve(ROOT, 'deployment/compose.yml'), 'utf8'),
) as { services: { server: { environment: Record<string, string> } } };

describe('deployment compose', () => {
  it.each([
    'LOG_LEVEL',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'TRACE_SAMPLE_RATE',
    'SENTRY_DSN',
    'ERROR_REPORTING_ENABLED',
  ])('passes the optional %s through to the server', (name) => {
    expect(compose.services.server.environment[name]).toBe(`\${${name}:-}`);
  });
});
