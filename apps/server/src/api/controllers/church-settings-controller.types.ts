import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IChurchSettingsManager } from '../../domain/contracts/application/church-settings-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface ChurchSettingsControllerDependencies {
  churchSettingsManager: IChurchSettingsManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
