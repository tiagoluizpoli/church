import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';

export interface PlanningEventAdminControllerDependencies {
  planningEventManager: IPlanningEventManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
