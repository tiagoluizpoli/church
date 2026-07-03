import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { registerInjections } from '../main/di/injections';
import { registerControllers } from '../main/fastify/register-controllers';
import { createFastify } from '../main/fastify/setup';

async function exportOpenApi(): Promise<void> {
  registerInjections();

  const app = await createFastify();
  await app.register(
    async (instance) => {
      await registerControllers(instance);
    },
    { prefix: '/api/v1' },
  );
  await app.ready();

  const yaml = app.swagger({ yaml: true });
  const outputPath = resolve(import.meta.dir, '../../auto-generated-api.yaml');

  await writeFile(outputPath, yaml, 'utf8');
  await app.close();
}

exportOpenApi().catch((error) => {
  console.error(error);
  process.exit(1);
});
