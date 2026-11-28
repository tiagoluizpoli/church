import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';

export interface ChurchAdminControllerDependencies {
  cycleManager: ICycleManager;
  eventTemplateManager: IEventTemplateManager;
  planningEventManager: IPlanningEventManager;
  activeChurchResolver: IActiveChurchResolver;
  ministryManager: IMinistryManager;
  setupProgressManager: ISetupProgressManager;
  authorityGuard: IAuthorityGuard;
}
