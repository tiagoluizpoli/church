import { db } from '@church/db';
import { env } from '@church/env/server';
import { sql } from 'drizzle-orm';
import type { IOutboxPoller } from '../domain/contracts/application/outbox-poller';
import { serializeError } from '../infrastructure/privacy/privacy';
import { initErrorReporting } from '../infrastructure/services/sentry-error-reporter';
import { createCompositionRoot } from './di/composition-root';
import { registerErrorReportTunnel } from './fastify/error-report-tunnel';
import { registerReadiness } from './fastify/readiness';
import { registerControllers } from './fastify/register-controllers';
import { createFastify } from './fastify/setup';
import { OutboxPoller } from './outbox-poller';
import { createShutdown, logUnhandledRejection } from './shutdown';
import type { LogEntry } from './shutdown.types';

async function start(): Promise<void> {
  const reportingDsn = initErrorReporting({
    dsn: env.SENTRY_DSN,
    enabled: env.ERROR_REPORTING_ENABLED,
    environment: env.CHURCH_ENVIRONMENT,
    revision: env.APP_REVISION,
  });
  const root = createCompositionRoot();

  const app = await createFastify({
    locale: root.locale,
    errorReporter: root.errorReporter,
    sessionGateway: root.sessionGateway,
  });

  await app.register(
    async (instance) => {
      await registerControllers({
        app: instance,
        controllers: root.controllers,
      });
    },
    { prefix: '/api/v1' },
  );

  registerErrorReportTunnel({
    app,
    dsn: reportingDsn,
    environment: env.CHURCH_ENVIRONMENT,
    settings: root.errorReportTunnel,
  });

  registerReadiness({
    app,
    revision: env.APP_REVISION,
    checkDatabase: () => db.execute(sql`select 1`),
  });

  // The app logger's err serializer scrubs the error (ADR-0014).
  const log = ({ message, error }: LogEntry) =>
    error === undefined
      ? app.log.info(message)
      : app.log.error({ err: error }, message);

  const outboxPoller: IOutboxPoller = new OutboxPoller({
    drainer: root.outboxDrainer,
    intervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    batchSize: env.OUTBOX_DRAIN_BATCH_SIZE,
  });
  outboxPoller.start();

  const shutdown = createShutdown({
    closeApp: () => app.close(),
    stopPoller: () => outboxPoller.stop(),
    closeDatabase: () => db.$client.end(),
    exit: (code) => process.exit(code),
    log,
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(signal));
  }
  process.on('unhandledRejection', (reason) =>
    logUnhandledRejection({ reason, log }),
  );

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  // No app logger yet: scrub like its err serializer does (ADR-0014).
  console.error('[server] startup failed:', serializeError(err));
  process.exit(1);
});
