import type { Locale } from '@church/i18n/runtime';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DestinationStream } from 'pino';
import type { ErrorReporter } from '../../domain/contracts/infrastructure/error-reporter';
import type { SessionGateway } from '../../domain/contracts/infrastructure/session-gateway';
import type { createFastify } from './setup';

export type FastifyFactory = (
  opts?: Record<string, unknown>,
) => FastifyInstance;

export interface LocaleSettings {
  localeCookieName: string;
  defaultLocale: Locale;
}

export interface CreateFastifyInput {
  locale: LocaleSettings;
  /** The composition root's reporter, for unexpected 500s. */
  errorReporter: ErrorReporter;
  /** Forces logging to this stream in any mode; tests capture log lines here. */
  logStream?: DestinationStream;
  /** The composition root's session lookup; defaults to the server auth instance. */
  sessionGateway?: SessionGateway;
}

export interface ReportUnexpectedInput {
  errorReporter: ErrorReporter;
  error: unknown;
  request: FastifyRequest;
}

export interface LoggingOptionsInput {
  logStream: DestinationStream | undefined;
  isTest: boolean;
  isProd: boolean;
}

export type FastifyTypedInstance = Awaited<ReturnType<typeof createFastify>>;
