import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RefusalCode } from './error-table.types';

export interface RefuseInput {
  reply: FastifyReply;
  request: FastifyRequest;
  code: RefusalCode;
}
