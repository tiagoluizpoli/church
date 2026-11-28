import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventManager } from '../../domain/contracts/application/event-manager';

export interface DenySchedulingFunctionInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface DenyMinistryObjectInput {
  request: FastifyRequest;
  reply: FastifyReply;
  ministryId: string;
}

export interface EventControllerDependencies {
  eventManager: IEventManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
