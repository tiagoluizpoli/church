import type { Repositories } from './build-repositories.types';
import type { CompositionRootDependencies } from './dependencies.types';

export type Auth = Pick<
  CompositionRootDependencies,
  | 'scopeRepository'
  | 'authorityActorRepository'
  | 'churchMembershipRepository'
  | 'authorityManager'
  | 'authorityGuard'
  | 'activeChurchResolver'
>;

export interface BuildAuthInput {
  database: CompositionRootDependencies['db'];
  repositories: Repositories;
  overrides: Partial<CompositionRootDependencies>;
}
