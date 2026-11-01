import { env } from '@church/env/server';
import { createCompositionRoot } from './di/composition-root';
import { registerControllers } from './fastify/register-controllers';
import { createFastify } from './fastify/setup';
import { OutboxPoller } from './outbox-poller';

async function start(): Promise<void> {
  const root = createCompositionRoot();

  const app = await createFastify({ locale: root.locale, auth: root.auth });

  await app.register(
    async (instance) => {
      await registerControllers({
        app: instance,
        controllers: root.controllers,
      });
    },
    { prefix: '/api/v1' },
  );

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
