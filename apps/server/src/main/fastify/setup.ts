import 'reflect-metadata';
import { auth } from '@church/auth';
import { DomainError } from '@church/core';
import { env } from '@church/env/server';
import swagger from '@fastify/swagger';
import apiReference from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { FastifyTypedInstance } from './types';

const ERROR_MAP: Record<string, { status: number }> = {
  INVALID_DATE_RANGE: { status: 400 },
  INVALID_REQUIRED_COUNT: { status: 400 },
  INVALID_EVENT_DURATION: { status: 400 },
  INVALID_SLOT_DURATION: { status: 400 },
  INVALID_OVERRIDE_REASON: { status: 400 },
  NOT_FOUND: { status: 404 },
  UNAUTHORIZED_OVERRIDE: { status: 403 },
  ISOLATION_BREACH: { status: 409 },
  DUPLICATE_SLOTS: { status: 409 },
  INVALID_STATE_TRANSITION: { status: 409 },
  HARD_CONSTRAINT_VIOLATION: { status: 409 },
  EMPTY_SCHEDULE: { status: 422 },
  PAST_EVENT: { status: 422 },
  PUBLISH_VALIDATION: { status: 422 },
};

export async function createFastify(): Promise<FastifyTypedInstance> {
  const isDev = env.NODE_ENV !== 'production';

  const app = Fastify({
    logger: isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : true,
  }).withTypeProvider();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Church API', version: '1.0.0' },
    },
  });

  if (isDev) {
    await app.register(apiReference, { routePrefix: '/documentation' });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      const mapped = ERROR_MAP[error.code];
      const status = mapped?.status ?? 500;
      request.log.warn(
        { code: error.code, message: error.message },
        'DomainError',
      );
      return reply
        .status(status)
        .send({ error: error.code, message: error.message });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        issues: error.validation,
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error(
        { issues: error.cause.issues, url: request.url },
        'Serialization error',
      );
      return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
    }

    request.log.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    });
    done();
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) headers.append(key, value.toString());
      }
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.send(response.body ? await response.text() : null);
    },
  });

  return app as unknown as FastifyTypedInstance;
}
