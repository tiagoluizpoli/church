import { appConfig } from '@church/app-config';
import type { Auth } from '@church/auth';
import { db } from '@church/db';
import type { FastifyController } from '../../api/contracts/fastify-controller';
import type { IOutboxDrainer } from '../../domain/contracts/application';
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
  /** The Better Auth instance HTTP auth must serve. */
  auth: Auth;
  outboxDrainer: IOutboxDrainer;
  locale: LocaleSettings;
}

export function createCompositionRoot(
  overrides: Partial<CompositionRootDependencies> = {},
): CompositionRoot {
  const config = overrides.config ?? appConfig;
  const database = overrides.db ?? db;

  const repositories = buildRepositories({ config, database, overrides });
  const services = buildServices({ config, database, overrides });
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
    auth: services.betterAuth,
    outboxDrainer: managers.outboxDrainer,
    locale: {
      localeCookieName: config.localeCookieName,
      defaultLocale: config.defaultLocale,
    },
  };
}
