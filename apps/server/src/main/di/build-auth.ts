import { AuthorityGuard } from '../../api/auth/authority-guard';
import { DbActiveChurchResolver, DbAuthorityManager } from '../../application';
import { DrizzleAuthorityActorResolver } from '../../infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '../../infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '../../infrastructure/auth/drizzle-scheduling-scope-resolver';
import type { Repositories } from './build-repositories';
import type { CompositionRootDependencies } from './dependencies';

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

export function buildAuth({
  database,
  repositories: {
    eventRepository,
    eventTimeBlockRepository,
    ministryRepository,
    teamRepository,
    churchRepository,
    unitOfWork,
  },
  overrides,
}: BuildAuthInput): Auth {
  const scopeRepository =
    overrides.scopeRepository ??
    new DrizzleSchedulingScopeResolver({ db: database });
  const authorityActorRepository =
    overrides.authorityActorRepository ??
    new DrizzleAuthorityActorResolver({ db: database });
  const churchMembershipRepository =
    overrides.churchMembershipRepository ??
    new DrizzleChurchMembershipRepository({ db: database });
  const authorityManager =
    overrides.authorityManager ??
    new DbAuthorityManager({
      actorRepository: authorityActorRepository,
      scopeRepository,
      eventRepository,
      eventTimeBlockRepository,
      ministryRepository,
      teamRepository,
    });
  const authorityGuard =
    overrides.authorityGuard ??
    new AuthorityGuard({ manager: authorityManager });
  const activeChurchResolver =
    overrides.activeChurchResolver ??
    new DbActiveChurchResolver({
      actorRepository: authorityActorRepository,
      membershipRepository: churchMembershipRepository,
      churchRepository,
      unitOfWork,
    });

  return {
    scopeRepository,
    authorityActorRepository,
    churchMembershipRepository,
    authorityManager,
    authorityGuard,
    activeChurchResolver,
  };
}
