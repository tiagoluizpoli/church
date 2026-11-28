import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IChurchSettingsManager } from '../../domain/contracts/application/church-settings-manager';

export interface ChurchSettingsControllerDependencies {
  churchSettingsManager: IChurchSettingsManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
