import type { FastifyReply } from 'fastify';
import { ERROR_TABLE, errorMessage } from './error-table';
import type { RefuseInput } from './refuse.types';

/**
 * Sends a refusal: `{ error, message }` in the request locale. Controllers
 * throw a `RefusalError` instead; the global error handler answers it here.
 */
export function refuse({ reply, request, code }: RefuseInput): FastifyReply {
  const message = errorMessage({ code, locale: request.locale });
  return reply.status(ERROR_TABLE[code].status).send({ error: code, message });
}
