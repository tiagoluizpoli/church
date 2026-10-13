import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChurchId, EventId, UserId } from '../../domain/branded-ids';
import type { AuthorityGuard } from './authority-guard';

export interface DenyEventScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  eventId: string;
  authorityGuard: AuthorityGuard;
}

/**
 * Gates per-event routes on the `canManageEvent` check.
 *
 * Returns whether access was denied. `FastifyReply` is a thenable (it
 * resolves once the response is flushed) — `return reply.send(...)` from an
 * `async` function would have its own returned promise silently adopt that
 * reply's resolution instead of the reply object itself, so callers must
 * never `await` a reply and branch on the awaited value. This sends the 403
 * as a side effect and returns a plain boolean.
 */
export async function denyEventScope({
  request,
  reply,
  eventId,
  authorityGuard,
}: DenyEventScopeInput): Promise<boolean> {
  const allowed = await authorityGuard.canManageEvent({
    churchId: ChurchId.from(request.churchId),
    eventId: EventId.from(eventId),
    userId: UserId.from(request.userId),
  });
  if (allowed) return false;

  reply.status(403).send({
    error: 'FORBIDDEN',
    message: 'Not a leader of this event',
  });
  return true;
}
