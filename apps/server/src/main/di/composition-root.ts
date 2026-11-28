import { appConfig } from '@church/app-config';
import { db } from '@church/db';
import { buildAuth } from './build-auth';
import { buildControllers } from './build-controllers';
import { buildManagers } from './build-managers';
import { buildRepositories } from './build-repositories';
import { buildServices } from './build-services';
import type { CompositionRoot } from './composition-root.types';
import type { CompositionRootDependencies } from './dependencies.types';

export type { CompositionRootDependencies } from './dependencies.types';

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
  const controllers = buildControllers({
    config,
    managers,
    services,
    auth,
  });

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
