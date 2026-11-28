import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ISwapRequestListManager } from '../../domain/contracts/application/swap-request-list-manager';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';

export interface SwapRequestListControllerDependencies {
  swapRequestListManager: ISwapRequestListManager;
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
