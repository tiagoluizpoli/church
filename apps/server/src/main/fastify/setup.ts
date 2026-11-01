import { type Auth, auth as defaultAuth } from '@church/auth';
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
import pino from 'pino';
import PinoPretty from 'pino-pretty';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import { registerE2eTargetHeader } from '../../api/utils/e2e-target-header';
import {
  domainErrorMessage,
  validationReason,
} from '../../api/utils/error-messages';
import { errorStatus } from '../../api/utils/error-table';
import { requestLocale } from '../../api/utils/request-locale';

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
  /** The composed instance; defaults to the package's plain one. */
  auth?: Auth;
}

export async function createFastify({
  locale: localeSettings,
  auth = defaultAuth,
}: CreateFastifyInput) {
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

  registerE2eTargetHeader({ app, enabled: debugEndpointsEnabled() });

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
  app.decorateRequest('locale', localeSettings.defaultLocale);
  app.addHook('onRequest', async (request) => {
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
      const reason = validationReason(error);
      return reply.status(status).send({
        error: error.code,
        message: message ?? genericError,
        ...(reason && { reason }),
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
        { issues: error.cause.issues, url: request.url },
        'Serialization error',
      );
      return reply.code(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: genericError,
      });
    }

    request.log.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: genericError,
    });
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
