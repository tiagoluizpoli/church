import type { FastifyRequest } from 'fastify';
import type { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface ResolveActiveChurchAndPersistInput {
  resolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  request: FastifyRequest;
  userId: UserId;
  activeOrganizationId: ChurchId | null;
}
