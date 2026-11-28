import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventGroupManager } from '../../domain/contracts/application/event-group-manager';

export interface EventGroupRouteParams {
  ministryId: string;
}

export interface EventGroupControllerDependencies {
  eventGroupManager: IEventGroupManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
