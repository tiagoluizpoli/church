import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface SwapRequestControllerDependencies {
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
}
