import { db } from '@church/db';
import { env } from '@church/env/server';
import { sql } from 'drizzle-orm';
import { initErrorReporting } from '../infrastructure/services/sentry-error-reporter';
import { createCompositionRoot } from './di/composition-root';
import { registerErrorReportTunnel } from './fastify/error-report-tunnel';
import { registerReadiness } from './fastify/readiness';
import { registerControllers } from './fastify/register-controllers';
import { createFastify } from './fastify/setup';
import { OutboxPoller } from './outbox-poller';

async function start(): Promise<void> {
  initErrorReporting({
    dsn: env.SENTRY_DSN,
    enabled: env.ERROR_REPORTING_ENABLED,
    environment: env.CHURCH_ENVIRONMENT,
    revision: env.APP_REVISION,
  });
  const root = createCompositionRoot();

  const app = await createFastify({ locale: root.locale });

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
    dsn: env.ERROR_REPORTING_ENABLED ? env.SENTRY_DSN : undefined,
    environment: env.CHURCH_ENVIRONMENT,
    settings: root.errorReportTunnel,
  });

  registerReadiness({
    app,
    revision: env.APP_REVISION,
    checkDatabase: () => db.execute(sql`select 1`),
  });

  const outboxPoller = new OutboxPoller({
    drainer: root.outboxDrainer,
    intervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    batchSize: env.OUTBOX_DRAIN_BATCH_SIZE,
  });
  outboxPoller.start();
  app.addHook('onClose', async () => {
    outboxPoller.stop();
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
