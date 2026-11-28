import type { FastifyController } from '@/api/contracts/fastify-controller';
import { CycleAdminController } from '@/api/controllers/cycle-admin-controller';
import type { CycleAdminControllerDependencies } from '@/api/controllers/cycle-admin-controller.types';
import { EventTemplateAdminController } from '@/api/controllers/event-template-admin-controller';
import type { EventTemplateAdminControllerDependencies } from '@/api/controllers/event-template-admin-controller.types';
import { EventTimeBlockAdminController } from '@/api/controllers/event-time-block-admin-controller';
import { MinistryAdminController } from '@/api/controllers/ministry-admin-controller';
import type { MinistryAdminControllerDependencies } from '@/api/controllers/ministry-admin-controller.types';
import { PlanningEventAdminController } from '@/api/controllers/planning-event-admin-controller';
import type { PlanningEventAdminControllerDependencies } from '@/api/controllers/planning-event-admin-controller.types';
import type { FastifyTypedInstance } from '@/main/fastify/types';

type ChurchAdminControllersDependencies = CycleAdminControllerDependencies &
  EventTemplateAdminControllerDependencies &
  PlanningEventAdminControllerDependencies &
  MinistryAdminControllerDependencies;

/**
 * Every `/admin` resource controller as one registrable unit, so an HTTP test
 * mounts the whole Church admin surface the way production does.
 */
export class ChurchAdminControllers implements FastifyController {
  readonly prefix = '/admin';

  private readonly controllers: FastifyController[];

  constructor(dependencies: ChurchAdminControllersDependencies) {
    this.controllers = [
      new CycleAdminController(dependencies),
      new EventTemplateAdminController(dependencies),
      new PlanningEventAdminController(dependencies),
      new EventTimeBlockAdminController(dependencies),
      new MinistryAdminController(dependencies),
    ];
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(app: FastifyTypedInstance, _opts: Record<string, unknown>) {
    for (const controller of this.controllers) {
      app.register(controller.registerRoutes.bind(controller));
    }
  }
}
