import { allowedOrigins, DESKTOP_ORIGIN } from '@church/auth/allowed-origins';
import { DomainError } from '@church/core';
import { env } from '@church/env/server';
import { m } from '@church/i18n/messages';
import fastifyCors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import apiReference from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import pino from 'pino';
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
import { refuse } from '../../api/utils/refuse';
import { requestLocale } from '../../api/utils/request-locale';
import { ChurchId, UserId, VolunteerId } from '../../domain/branded-ids';
import { HardConstraintError } from '../../domain/conflict/errors/hard-constraint-error';
import {
  redactUrl,
  serializeError,
  serializeRequest,
} from '../../infrastructure/privacy/privacy';
import { AuthBackendUnavailableError } from '../../infrastructure/services/auth-backend-unavailable-error';
import { BetterAuthSessionGateway } from '../../infrastructure/services/better-auth-session-gateway';
import { auth } from '../di/server-auth';
import { fastifyOtel } from '../instrumentation';
import { requestId } from './request-id';
import type {
  CreateFastifyInput,
  FastifyFactory,
  LoggingOptionsInput,
  ReportUnexpectedInput,
} from './setup.types';

// moduleResolution:bundler cannot expose call signatures for CJS export= packages.
// Cast to a concrete factory type so TypeScript knows the return value is a FastifyInstance.
const createFastifyInstance = Fastify as unknown as FastifyFactory;

const logSerializers = { req: serializeRequest, err: serializeError };

export { DESKTOP_ORIGIN };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  sessionGateway = new BetterAuthSessionGateway({ auth }),
}: CreateFastifyInput) {
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';

  const logging = loggingOptions({ logStream, isTest, isProd });
  const app = createFastifyInstance({
    genReqId: requestId,
    trustProxy: env.TRUST_PROXY_HOPS,
    ...logging,
  }).withTypeProvider<ZodTypeProvider>();

  // First, so its onRequest hook runs right after genReqId (see request-id.ts).
  await app.register(fastifyOtel.plugin());

  registerE2eTargetHeader({ app, enabled: debugEndpointsEnabled() });

  await app.register(fastifyCors, {
    origin: [...allowedOrigins],
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

  app.decorate('sessionGateway', sessionGateway);
  app.decorateRequest('userId', UserId.from(''));
  app.decorateRequest('volunteerId', VolunteerId.from(''));
  app.decorateRequest('churchId', ChurchId.from(''));
  app.decorateRequest('locale', localeSettings.defaultLocale);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    request.locale = requestLocale({
      cookieHeader: request.headers.cookie,
      ...localeSettings,
    });
  });

  // Non-browser clients send neither header and pass. A browser sends Origin
  // on every non-GET; an allowed one may be cross-site (CORS), any other
  // Origin, or a cross-site request without one, is refused. After the
  // locale hook, so the refusal reads in the request locale.
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    const { origin, 'sec-fetch-site': fetchSite } = request.headers;
    const allowed = origin !== undefined && allowedOrigins.includes(origin);
    if (allowed || (origin === undefined && fetchSite !== 'cross-site')) return;
    return refuse({ reply, request, code: 'FORBIDDEN' });
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

    if (error instanceof AuthBackendUnavailableError) {
      // A transient auth outage is a 503, never a 401 the client reads as a sign-out.
      // The cause's code only, as for the database: its message may carry the connection string.
      const code = connectionErrorCode({ error }) ?? null;
      request.log.error({ code, url }, 'Auth backend failure');
      return reply.status(503).header('Retry-After', '5').send({
        error: 'SERVICE_UNAVAILABLE',
        message: genericError,
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
