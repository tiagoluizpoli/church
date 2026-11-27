import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryRoleManager } from '../../domain/contracts/application/ministry-role-manager';

export interface MinistryRolesRouteParams {
  ministryId: string;
}

export interface MinistryRoleRouteParams extends MinistryRolesRouteParams {
  roleId: string;
}

export interface MinistryRoleControllerDependencies {
  ministryRoleManager: IMinistryRoleManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
