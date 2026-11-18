import type { FastifyTypedInstance } from './types';
import type { FastifyController } from '@/api/contracts/fastify-controller';

interface RegisterControllersParams {
  app: FastifyTypedInstance;
  controllers: FastifyController[];
}

export const registerControllers = async ({
  app,
  controllers,
}: RegisterControllersParams): Promise<void> => {
  for (const ctrl of controllers) {
    app.register(ctrl.registerRoutes.bind(ctrl), { prefix: ctrl.prefix });
  }
};
