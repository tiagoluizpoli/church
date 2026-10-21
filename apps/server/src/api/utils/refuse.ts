import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_TABLE, errorMessage, type RefusalCode } from './error-table';
import { requestLocale } from './request-locale';

interface RefuseInput {
  reply: FastifyReply;
  request: FastifyRequest;
  code: RefusalCode;
}

/** The one way a controller refuses: `{ error, message }` in the request locale. */
export function refuse({ reply, request, code }: RefuseInput): FastifyReply {
  const message = errorMessage({ code, locale: requestLocale(request) });
  return reply.status(ERROR_TABLE[code].status).send({ error: code, message });
}
