import type { CallerSession } from '../../domain/contracts/infrastructure';
import { headersFromRequest } from '../utils/headers';
import { RefusalError } from '../utils/refusal-error';
import type { RequireSessionInput } from './require-session.types';

/**
 * The caller's session, or a 401 refusal when there is none: the one check
 * behind Active Church pre-validation, the active-church routes and the
 * redemption routes. An auth-backend outage still surfaces as the gateway's
 * own error (503), never as this refusal.
 */
export async function requireSession({
  sessionGateway,
  request,
}: RequireSessionInput): Promise<CallerSession> {
  const session = await sessionGateway.lookup({
    headers: headersFromRequest(request),
  });
  if (!session) throw new RefusalError({ code: 'UNAUTHORIZED' });
  return session;
}
