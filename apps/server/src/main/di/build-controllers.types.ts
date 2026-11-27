import type { Auth } from './build-auth.types';
import type { Managers } from './build-managers.types';
import type { Services } from './build-services.types';
import type { CompositionRootDependencies } from './dependencies.types';

export interface BuildControllersInput {
  config: CompositionRootDependencies['config'];
  managers: Managers;
  services: Pick<Services, 'webShell'>;
  auth: Auth;
}
