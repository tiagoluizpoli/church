import { DomainError } from '@church/core';
import { env } from '@church/env/server';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
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
import pino, { type DestinationStream } from 'pino';
import PinoPretty from 'pino-pretty';
import { connectionErrorCode } from '../../api/utils/connection-error';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import { registerE2eTargetHeader } from '../../api/utils/e2e-target-header';
import {
  archiveBlockers,
  conflictingCycles,
  domainErrorMessage,
  existingInvitation,
  flaggedBlocks,
  headcountFloors,
  invalidEvents,
  outsideEvents,
  publishedShiftIds,
  remindAvailableAt,
  shiftResponses,
  upcomingAssignments,
  validationField,
  validationReason,
} from '../../api/utils/error-messages';
import { errorStatus } from '../../api/utils/error-table';
import { requestLocale } from '../../api/utils/request-locale';
import { HardConstraintError } from '../../domain/conflict/errors/hard-constraint-error';
import {
  redactUrl,
  serializeRequest,
} from '../../infrastructure/privacy/privacy';
import { auth } from '../di/server-auth';
import { requestId } from './request-id';

// moduleResolution:bundler cannot expose call signatures for CJS export= packages.
// Cast to a concrete factory type so TypeScript knows the return value is a FastifyInstance.
type FastifyFactory = (opts?: Record<string, unknown>) => FastifyInstance;
const createFastifyInstance = Fastify as unknown as FastifyFactory;

export interface LocaleSettings {
  localeCookieName: string;
  defaultLocale: Locale;
}

interface CreateFastifyInput {
  locale: LocaleSettings;
  /** Forces logging to this stream in any mode; tests capture log lines here. */
  logStream?: DestinationStream;
}

const logSerializers = { req: serializeRequest };

export async function createFastify({
  locale: localeSettings,
  logStream,
}: CreateFastifyInput) {
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';

  // Bun doesn't support pino worker-thread transports — use a synchronous
  // pino-pretty stream in dev instead of the transport API.
  const devLogger = pino(
    { level: 'info', serializers: logSerializers },
    PinoPretty({ colorize: true, translateTime: 'HH:MM:ss' }),
  );

  const app = logStream
    ? createFastifyInstance({
        genReqId: requestId,
        loggerInstance: pino(
          { level: 'info', serializers: logSerializers },
          logStream,
        ),
      })
    : isTest
      ? createFastifyInstance({ genReqId: requestId, logger: false })
      : isProd
        ? createFastifyInstance({
            genReqId: requestId,
            logger: { serializers: logSerializers },
          })
        : createFastifyInstance({
            genReqId: requestId,
            loggerInstance: devLogger,
          });

  registerE2eTargetHeader({ app, enabled: debugEndpointsEnabled() });

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'traceparent',
    ],
    exposedHeaders: ['x-request-id'],
    credentials: true,
    maxAge: 86400,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorateRequest('userId', '');
  app.decorateRequest('volunteerId', '');
  app.decorateRequest('churchId', '');
  app.decorateRequest('locale', localeSettings.defaultLocale);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    request.locale = requestLocale({
      cookieHeader: request.headers.cookie,
      ...localeSettings,
    });
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Church API', version: '1.0.0' },
      tags: [
        { name: 'events', description: 'Event management endpoints' },
        {
          name: 'event-time-blocks',
          description: 'Event EventTimeBlock endpoints',
        },
        { name: 'assignments', description: 'Assignment endpoints' },
        {
          name: 'ministries',
          description: 'Ministry and invitation endpoints',
        },
        {
          name: 'planning',
          description: 'Church-administration planning endpoints',
        },
        {
          name: 'prepare',
          description: 'MinistryParticipation prepare endpoints',
        },
        {
          name: 'assign',
          description: 'Cycle and shift assign endpoints',
        },
        {
          name: 'caller-capabilities',
          description: 'Current caller capabilities in the Active Church',
        },
        { name: 'volunteer', description: 'Volunteer-facing endpoints' },
        {
          name: 'active-church',
          description: 'Active Church selection endpoints',
        },
        {
          name: 'redemption',
          description: 'Church and Ministry Invitation redemption endpoints',
        },
        {
          name: 'redemption-debug',
          description:
            'Non-production debug endpoints for invitation redemption',
        },
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
    const { locale } = request;
    const genericError = m.common_generic_error({}, { locale });
    if (error instanceof DomainError) {
      const status = errorStatus({ code: error.code }) ?? 500;
      request.log.warn(
        { code: error.code, message: error.message },
        'DomainError',
      );
      const message = domainErrorMessage({ error, locale });
      if (message === undefined) {
        request.log.warn({ code: error.code }, 'No catalog message for code');
      }
      const reason =
        error instanceof HardConstraintError &&
        (error.reason === 'NOT_QUALIFIED' ||
          error.reason === 'DUPLICATE_ASSIGNMENT')
          ? error.reason
          : validationReason(error);
      const field = validationField(error);
      const blockers = archiveBlockers(error);
      const existing = existingInvitation(error);
      const assignments = upcomingAssignments(error);
      const cycles = conflictingCycles(error);
      const outside = outsideEvents(error);
      const invalid = invalidEvents(error);
      const floors = headcountFloors(error);
      const responses = shiftResponses(error);
      const flagged = flaggedBlocks(error);
      const published = publishedShiftIds(error);
      const availableAt = remindAvailableAt(error);
      return reply.status(status).send({
        error: error.code,
        message: message ?? genericError,
        ...(reason && { reason }),
        ...(field && { field }),
        ...(blockers && { blockers }),
        ...(existing && { existingInvitation: existing }),
        ...(assignments && { assignments }),
        ...(cycles && { conflictingCycles: cycles }),
        ...(outside && { outsideEvents: outside }),
        ...(invalid && { invalidEvents: invalid }),
        ...(floors && { headcountFloors: floors }),
        ...(responses && { shiftResponses: responses }),
        ...(flagged && { flaggedBlocks: flagged }),
        ...(published && { shiftIds: published }),
        ...(availableAt && { remindAvailableAt: availableAt }),
      });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(422).send({
        error: 'VALIDATION_ERROR',
        message: m.common_validation_error({}, { locale }),
        issues: error.validation,
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error(
        { issues: error.cause.issues, url: redactUrl({ url: request.url }) },
        'Serialization error',
      );
      return reply.code(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: genericError,
        requestId: request.id,
      });
    }

    const connectionCode = connectionErrorCode({ error });
    if (connectionCode) {
      // Log the code only: the error message may carry the connection string.
      request.log.error(
        { code: connectionCode, url: redactUrl({ url: request.url }) },
        'Database connection failure',
      );
      return reply.status(503).header('Retry-After', '5').send({
        error: 'SERVICE_UNAVAILABLE',
        message: genericError,
      });
    }

    request.log.error(
      { err: error, url: redactUrl({ url: request.url }) },
      'Unhandled error',
    );
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: genericError,
      requestId: request.id,
    });
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      method: request.method,
      url: redactUrl({ url: request.url }),
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
