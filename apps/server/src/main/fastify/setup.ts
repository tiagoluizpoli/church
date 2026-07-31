import 'reflect-metadata';
import { auth } from '@church/auth';
import { DomainError } from '@church/core';
import { env } from '@church/env/server';
import fastifyCors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import apiReference from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import pino from 'pino';
import PinoPretty from 'pino-pretty';

// moduleResolution:bundler cannot expose call signatures for CJS export= packages.
// Cast to a concrete factory type so TypeScript knows the return value is a FastifyInstance.
type FastifyFactory = (opts?: Record<string, unknown>) => FastifyInstance;
const createFastifyInstance = Fastify as unknown as FastifyFactory;
const ERROR_MAP: Record<string, { status: number }> = {
  INVALID_DATE_RANGE: { status: 400 },
  INVALID_TIME_RANGE: { status: 400 },
  INVALID_REQUIRED_COUNT: { status: 400 },
  INVALID_SHIFT_SPLIT: { status: 400 },
  INVALID_WEEKDAY: { status: 400 },
  INVALID_EVENT_DURATION: { status: 400 },
  INVALID_SLOT_DURATION: { status: 400 },
  INVALID_OVERRIDE_REASON: { status: 400 },
  NOT_FOUND: { status: 404 },
  MINISTRY_NOT_FOUND: { status: 404 },
  UNAUTHORIZED_OVERRIDE: { status: 403 },
  CHECK_ACCESS_DENIED: { status: 403 },
  ASSIGNMENT_ACCESS_DENIED: { status: 403 },
  INSUFFICIENT_INVITATION_AUTHORITY: { status: 403 },
  CANCEL_WINDOW_CLOSED: { status: 409 },
  AVAILABILITY_OVERLAP: { status: 409 },
  ISOLATION_BREACH: { status: 409 },
  CROSS_MINISTRY_SCOPE: { status: 409 },
  OVERLAPPING_CYCLE: { status: 409 },
  ILLEGAL_STATE_TRANSITION: { status: 409 },
  EVENT_OUTSIDE_PLANNING_CYCLE: { status: 409 },
  LAST_REMAINING_SLOT: { status: 409 },
  SHIFT_OUT_OF_BOUNDS: { status: 409 },
  DUPLICATE_SLOTS: { status: 409 },
  INVALID_STATE_TRANSITION: { status: 409 },
  HARD_CONSTRAINT_VIOLATION: { status: 409 },
  BELOW_FULL_PUBLISH: { status: 409 },
  INVITEE_ALREADY_MINISTRY_MEMBER: { status: 409 },
  EMPTY_SCHEDULE: { status: 422 },
  PAST_EVENT: { status: 422 },
  PUBLISH_VALIDATION: { status: 422 },
  INVALID_INVITATION_ROLE: { status: 422 },
};

export async function createFastify() {
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';

  // Bun doesn't support pino worker-thread transports — use a synchronous
  // pino-pretty stream in dev instead of the transport API.
  const devLogger = pino(
    { level: 'info' },
    PinoPretty({ colorize: true, translateTime: 'HH:MM:ss' }),
  );

  const app = isTest
    ? createFastifyInstance({ logger: false })
    : isProd
      ? createFastifyInstance({ logger: true })
      : createFastifyInstance({ loggerInstance: devLogger });

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorateRequest('userId', '');
  app.decorateRequest('volunteerId', '');
  app.decorateRequest('churchId', '');

  await app.register(swagger, {
    openapi: {
      info: { title: 'Church API', version: '1.0.0' },
      tags: [
        { name: 'admin', description: 'Admin and leader endpoints' },
        { name: 'volunteer', description: 'Volunteer-facing endpoints' },
        { name: 'feature-flags', description: 'Feature flag endpoints' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  if (!isProd && !isTest) {
    await app.register(swaggerUi, {
      routePrefix: '/docs/swagger',
    });

    await app.register(apiReference, {
      routePrefix: '/docs/scalar',
      configuration: {
        theme: 'kepler',
        darkMode: true,
        hideDarkModeToggle: true,
        defaultOpenAllTags: true,
      },
    });
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
      return reply.code(422).send({
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

  return app;
}
