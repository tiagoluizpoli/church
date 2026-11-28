import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface CycleAdminControllerDependencies {
  cycleManager: ICycleManager;
  setupProgressManager: ISetupProgressManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
