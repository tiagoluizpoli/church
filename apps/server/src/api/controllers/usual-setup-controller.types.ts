import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IUsualSetupManager } from '../../domain/contracts/application/usual-setup-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface UsualSetupControllerDependencies {
  ministryManager: IMinistryManager;
  usualSetupManager: IUsualSetupManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
