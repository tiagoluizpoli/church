import type { FastifyTypedInstance } from './setup.types';
import type { FastifyController } from '@/api/contracts/fastify-controller';

export interface RegisterControllersParams {
  app: FastifyTypedInstance;
  controllers: FastifyController[];
}
