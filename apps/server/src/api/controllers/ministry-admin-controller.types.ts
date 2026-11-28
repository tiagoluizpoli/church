import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';

export interface MinistryAdminControllerDependencies {
  ministryManager: IMinistryManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
