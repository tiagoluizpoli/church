import 'reflect-metadata';
import { env } from '@church/env/server';
import { registerInjections } from './di/injections';
import { registerControllers } from './fastify/register-controllers';
import { createFastify } from './fastify/setup';

async function start(): Promise<void> {
  registerInjections();

  const app = await createFastify();

  await app.register(
    async (instance) => {
      await registerControllers(instance);
    },
    { prefix: '/api/v1' },
  );

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
