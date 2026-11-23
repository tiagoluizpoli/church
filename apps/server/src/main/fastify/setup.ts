import { DomainError } from '@church/core';
import { env } from '@church/env/server';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import fastifyCors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import apiReference from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
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
  templateCollisions,
  upcomingAssignments,
  validationField,
  validationReason,
} from '../../api/utils/error-messages';
import { errorStatus } from '../../api/utils/error-table';
import { requestLocale } from '../../api/utils/request-locale';
import { HardConstraintError } from '../../domain/conflict/errors/hard-constraint-error';
import type { ErrorReporter } from '../../domain/contracts/infrastructure/error-reporter';
import {
  redactUrl,
  serializeError,
  serializeRequest,
} from '../../infrastructure/privacy/privacy';
import { auth } from '../di/server-auth';
import { fastifyOtel } from '../instrumentation';
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
  /** The composition root's reporter, for unexpected 500s. */
  errorReporter: ErrorReporter;
  /** Forces logging to this stream in any mode; tests capture log lines here. */
  logStream?: DestinationStream;
}

const logSerializers = { req: serializeRequest, err: serializeError };

/** The Electrobun desktop app serves the web bundle from this origin. */
export const DESKTOP_ORIGIN = 'views://mainview';

/** Unexpected 500s only; expected outcomes and 503s are never reported. */
function reportUnexpected({
  errorReporter,
  error,
  request,
}: ReportUnexpectedInput): void {
  const { id, userId, churchId, method, url, headers } = request;
  errorReporter.report({
    error,
    traceId: id,
    userId,
    churchId,
    request: { method, url, headers },
  });
}

interface ReportUnexpectedInput {
  errorReporter: ErrorReporter;
  error: unknown;
  request: FastifyRequest;
}

interface LoggingOptionsInput {
  logStream: DestinationStream | undefined;
  isTest: boolean;
  isProd: boolean;
}

/** Fastify's logger options for the mode; a given stream wins in any mode. */
function loggingOptions({ logStream, isTest, isProd }: LoggingOptionsInput) {
  const loggerOptions = { level: env.LOG_LEVEL, serializers: logSerializers };
  if (logStream) return { loggerInstance: pino(loggerOptions, logStream) };
  // Errors only, unredacted with their cause chain (test data is synthetic),
  // so a test's unexpected 500 names its cause instead of a bare requestId.
  if (isTest) {
    const testOptions = {
      level: 'error',
      serializers: { ...logSerializers, err: pino.stdSerializers.errWithCause },
    };
    return { loggerInstance: pino(testOptions, process.stderr) };
  }
  if (isProd) return { logger: loggerOptions };
  // Bun doesn't support pino worker-thread transports — use a synchronous
  // pino-pretty stream in dev instead of the transport API.
  const prettyStream = PinoPretty({
    colorize: true,
    translateTime: 'HH:MM:ss',
  });
  return { loggerInstance: pino(loggerOptions, prettyStream) };
}

export async function createFastify({
  locale: localeSettings,
  errorReporter,
  logStream,
}: CreateFastifyInput) {
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';

  const logging = loggingOptions({ logStream, isTest, isProd });
  const app = createFastifyInstance({
    genReqId: requestId,
    trustProxy: env.TRUST_PROXY_HOPS,
    ...logging,
  });

  // First, so its onRequest hook runs right after genReqId (see request-id.ts).
  await app.register(fastifyOtel.plugin());

  registerE2eTargetHeader({ app, enabled: debugEndpointsEnabled() });

  await app.register(fastifyCors, {
    origin: [env.CORS_ORIGIN, DESKTOP_ORIGIN],
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
    const url = redactUrl({ url: request.url });
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
      const collisions = templateCollisions(error);
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
        ...(collisions && { collisions }),
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
        { issues: error.cause.issues, url },
        'Serialization error',
      );
      reportUnexpected({ errorReporter, error, request });
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
        { code: connectionCode, url },
        'Database connection failure',
      );
      return reply.status(503).header('Retry-After', '5').send({
        error: 'SERVICE_UNAVAILABLE',
        message: genericError,
      });
    }

    request.log.error({ err: error, url }, 'Unhandled error');
    reportUnexpected({ errorReporter, error, request });
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: genericError,
      requestId: request.id,
    });
  });

  app.addHook('onResponse', (request, reply, done) => {
    const url = redactUrl({ url: request.url });
    request.log.info({
      method: request.method,
      url,
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
