import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';

export interface SwapRequestControllerDependencies {
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
}
