import type { z } from 'zod';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ISwapRequestListManager } from '../../domain/contracts/application/swap-request-list-manager';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';
import type { leaderSwapRequestsQuerySchema } from '../dtos/swap-request.dto';

export interface SwapRequestListControllerDependencies {
  swapRequestListManager: ISwapRequestListManager;
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}

export interface MinistryRouteParams {
  ministryId: string;
}

export interface KeepRouteParams extends MinistryRouteParams {
  swapRequestId: string;
}

export type LeaderSwapRequestsQuery = z.infer<
  typeof leaderSwapRequestsQuerySchema
>;
