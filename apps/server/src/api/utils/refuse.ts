import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_MESSAGES } from '../../main/fastify/error-messages';
import { requestLocale } from '../../main/fastify/request-locale';

/** Status per refusal code; 401/403/404 meaning is ADR-0009's. */
export const REFUSAL_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ACTIVE_CHURCH_SELECTION_REQUIRED: 409,
  RATE_LIMITED: 429,
  INVITATION_UNAVAILABLE: 404,
} as const;

export type RefusalCode = keyof typeof REFUSAL_STATUS;

/** The one way a controller refuses: `{ error, message }` in the request locale. */
export function refuse(
  reply: FastifyReply,
  request: FastifyRequest,
  code: RefusalCode,
): FastifyReply {
  const message = ERROR_MESSAGES[code]?.(
    {},
    { locale: requestLocale(request) },
  );
  return reply.status(REFUSAL_STATUS[code]).send({ error: code, message });
}
