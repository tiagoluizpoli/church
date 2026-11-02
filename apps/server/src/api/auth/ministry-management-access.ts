import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChurchId, type MinistryId, UserId } from '../../domain/branded-ids';
import { refuse } from '../utils/refuse';
import type { AuthorityGuard } from './authority-guard';

export interface DenyMinistryManagementInput {
  authorityGuard: AuthorityGuard;
  request: FastifyRequest;
  reply: FastifyReply;
  /** Omit for the function-level check only (403); pass for the object check too (404). */
  ministryId?: MinistryId;
}

/**
 * Whether the caller was refused managing a Ministry's setup: 403 without
 * any Ministry-management function, then 404 for a Ministry they may not
 * manage, indistinguishable from a missing one. `FastifyReply` is thenable,
 * so the refusal is sent as a side effect and a plain boolean returned.
 */
export async function denyMinistryManagement({
  authorityGuard,
  request,
  reply,
  ministryId,
}: DenyMinistryManagementInput): Promise<boolean> {
  const churchId = ChurchId.from(request.churchId);
  const userId = UserId.from(request.userId);
  const capability = await authorityGuard.decideManageAnyMinistry({
    churchId,
    userId,
  });
  if (!capability.allowed) {
    refuse({ reply, request, code: 'FORBIDDEN' });
    return true;
  }
  if (!ministryId) return false;
  const decision = await authorityGuard.decideManageMinistry({
    churchId,
    userId,
    ministryId,
  });
  if (decision.allowed) return false;
  refuse({ reply, request, code: 'NOT_FOUND' });
  return true;
}
