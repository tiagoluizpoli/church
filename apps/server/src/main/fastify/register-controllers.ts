import { container } from 'tsyringe';
import type { FastifyTypedInstance } from './types';
import type { FastifyController } from '@/api/contracts/fastify-controller';
import { injection } from '@/main/di/injection-tokens';

export const registerControllers = async (
  app: FastifyTypedInstance,
): Promise<void> => {
  const controllers = container.resolveAll<FastifyController>(
    injection.controllers.fastify,
  );
  for (const ctrl of controllers) {
    app.register(ctrl.registerRoutes.bind(ctrl), { prefix: ctrl.prefix });
  }
};
