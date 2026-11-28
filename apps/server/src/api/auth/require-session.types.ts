import type { FastifyRequest } from 'fastify';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface RequireSessionInput {
  sessionGateway: SessionGateway;
  request: FastifyRequest;
}
