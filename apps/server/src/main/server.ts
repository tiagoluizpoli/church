import 'reflect-metadata';
import { env } from '@church/env/server';
import { container } from 'tsyringe';
import type { IOutboxDrainer } from '../domain/contracts/application/outbox-drainer';
import { injection } from './di/injection-tokens';
import { registerInjections } from './di/injections';
import { registerControllers } from './fastify/register-controllers';
import { createFastify } from './fastify/setup';
import { OutboxPoller } from './outbox-poller';

async function start(): Promise<void> {
  registerInjections();

  const app = await createFastify();

  await app.register(
    async (instance) => {
      await registerControllers(instance);
    },
    { prefix: '/api/v1' },
  );

  const outboxPoller = new OutboxPoller({
    drainer: container.resolve<IOutboxDrainer>(
      injection.managers.outboxDrainer,
    ),
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
