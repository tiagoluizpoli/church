import type { AppConfig } from '@church/app-config';
import type { FastifyInstance } from 'fastify';

export interface RegisterErrorReportTunnelInput {
  app: FastifyInstance;
  /** Our DSN, or undefined while error reporting is off. */
  dsn: string | undefined;
  /** CHURCH_ENVIRONMENT; the web app reports under it. */
  environment: string;
  settings: AppConfig['errorReportTunnel'];
}
