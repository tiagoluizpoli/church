import type { FastifyRequest } from 'fastify';
import type { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';

export interface ResolveActiveChurchAndPersistInput {
  resolver: IActiveChurchResolver;
  request: FastifyRequest;
  userId: UserId;
  activeOrganizationId: ChurchId | null;
}
