import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';

export interface CycleAdminControllerDependencies {
  cycleManager: ICycleManager;
  setupProgressManager: ISetupProgressManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
