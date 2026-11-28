import { refuse } from '../utils/refuse';
import { requestCaller } from '../utils/request-caller';
import type { DenyMinistryManagementInput } from './ministry-management-access.types';

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
  const caller = requestCaller({ request });
  const capability = await authorityGuard.decideManageAnyMinistry(caller);
  if (!capability.allowed) {
    refuse({ reply, request, code: 'FORBIDDEN' });
    return true;
  }
  if (!ministryId) return false;
  const decision = await authorityGuard.decideManageMinistry({
    ...caller,
    ministryId,
  });
  if (decision.allowed) return false;
  refuse({ reply, request, code: 'NOT_FOUND' });
  return true;
}
