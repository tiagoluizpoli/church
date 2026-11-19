import { type AppConfig, appConfig } from '@church/app-config';
import { db } from '@church/db';
import type { FastifyController } from '../../api/contracts/fastify-controller';
import type { IOutboxDrainer } from '../../domain/contracts/application';
import type { ErrorReporter } from '../../domain/contracts/infrastructure';
import type { LocaleSettings } from '../fastify/setup';
import { buildAuth } from './build-auth';
import { buildControllers } from './build-controllers';
import { buildManagers } from './build-managers';
import { buildRepositories } from './build-repositories';
import { buildServices } from './build-services';
import type { CompositionRootDependencies } from './dependencies';

export type { CompositionRootDependencies } from './dependencies';

interface CompositionRoot {
  controllers: FastifyController[];
  outboxDrainer: IOutboxDrainer;
  locale: LocaleSettings;
  errorReportTunnel: AppConfig['errorReportTunnel'];
  /** The one reporter: the request error handler and the outbox share it. */
  errorReporter: ErrorReporter;
}

export function createCompositionRoot(
  overrides: Partial<CompositionRootDependencies> = {},
): CompositionRoot {
  const config = overrides.config ?? appConfig;
  const database = overrides.db ?? db;

  const repositories = buildRepositories({ config, database, overrides });
  const services = buildServices({ overrides });
  const auth = buildAuth({ database, repositories, overrides });
  const managers = buildManagers({
    config,
    overrides,
    repositories,
    services,
    auth,
  });
  const controllers = buildControllers({ config, managers, auth });

  return {
    controllers,
    outboxDrainer: managers.outboxDrainer,
    errorReportTunnel: config.errorReportTunnel,
    errorReporter: services.errorReporter,
    locale: {
      localeCookieName: config.localeCookieName,
      defaultLocale: config.defaultLocale,
    },
  };
}
