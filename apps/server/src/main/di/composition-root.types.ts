import type { AppConfig } from '@church/app-config';
import type { FastifyController } from '../../api/contracts/fastify-controller';
import type { IOutboxDrainer } from '../../domain/contracts/application';
import type {
  ErrorReporter,
  SessionGateway,
} from '../../domain/contracts/infrastructure';
import type { LocaleSettings } from '../fastify/setup.types';

export interface CompositionRoot {
  controllers: FastifyController[];
  outboxDrainer: IOutboxDrainer;
  locale: LocaleSettings;
  errorReportTunnel: AppConfig['errorReportTunnel'];
  /** The one reporter: the request error handler and the outbox share it. */
  errorReporter: ErrorReporter;
  /** The one session lookup, decorated onto the Fastify instance. */
  sessionGateway: SessionGateway;
}
