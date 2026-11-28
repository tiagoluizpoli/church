import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryRoleManager } from '../../domain/contracts/application/ministry-role-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface MinistryRoleControllerDependencies {
  ministryRoleManager: IMinistryRoleManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
