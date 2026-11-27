import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';

export interface CreateActiveChurchPreValidationInput {
  resolver: IActiveChurchResolver;
  /**
   * The route serves the caller's own Volunteer — e.g. their dashboard — so it
   * needs an active serving Membership, not just a leftover profile. A Church
   * admin with no Volunteer profile is a valid caller everywhere else, per the
   * authority matrix.
   */
  requireVolunteer?: boolean;
}

// named-parameters-ignore: Fastify preValidation hook signature (request, reply)
export type ActiveChurchPreValidation = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply | undefined>;
