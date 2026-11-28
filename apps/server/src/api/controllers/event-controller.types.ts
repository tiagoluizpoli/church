import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface EventControllerDependencies {
  eventManager: IEventManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
