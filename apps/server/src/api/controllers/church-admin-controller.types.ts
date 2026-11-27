import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';
import type { createEventTemplateBodySchema } from '../dtos/event-template.dto';
import type { EditPlanningEventBody } from '../dtos/planning-event.dto';

export interface EditInputInput {
  body: EditPlanningEventBody;
}

export type PrecedenceBody = z.infer<
  typeof createEventTemplateBodySchema
>['precedences'];

export interface ChurchAdminControllerDependencies {
  cycleManager: ICycleManager;
  eventTemplateManager: IEventTemplateManager;
  planningEventManager: IPlanningEventManager;
  activeChurchResolver: IActiveChurchResolver;
  ministryManager: IMinistryManager;
  setupProgressManager: ISetupProgressManager;
  authorityGuard: IAuthorityGuard;
}

export interface NestedObjectOperationInput<T> {
  request: FastifyRequest;
  reply: FastifyReply;
  operation: () => Promise<T>;
}
