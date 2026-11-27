import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MinistryId } from '../../domain/branded-ids';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';

export interface DenyMinistryManagementInput {
  authorityGuard: IAuthorityGuard;
  request: FastifyRequest;
  reply: FastifyReply;
  /** Omit for the function-level check only (403); pass for the object check too (404). */
  ministryId?: MinistryId;
}
