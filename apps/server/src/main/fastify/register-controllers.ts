import type { RegisterControllersParams } from './register-controllers.types';

export const registerControllers = async ({
  app,
  controllers,
}: RegisterControllersParams): Promise<void> => {
  for (const ctrl of controllers) {
    app.register(ctrl.registerRoutes.bind(ctrl), { prefix: ctrl.prefix });
  }
};
