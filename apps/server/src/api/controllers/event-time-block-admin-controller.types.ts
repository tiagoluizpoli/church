import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface EventTimeBlockAdminControllerDependencies {
  planningEventManager: IPlanningEventManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
