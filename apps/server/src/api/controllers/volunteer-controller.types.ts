import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';

export interface MinistryRouteParams {
  ministryId: string;
}

export interface AvailabilityCheckRouteParams {
  checkId: string;
}

export interface AssignmentRouteParams {
  assignmentId: string;
}

export interface VolunteerControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
}

export interface PrivateObjectOperationInput<T> {
  request: FastifyRequest;
  reply: FastifyReply;
  operation: () => Promise<T>;
}
