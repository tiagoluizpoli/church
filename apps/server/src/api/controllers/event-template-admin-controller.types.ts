import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface EventTemplateAdminControllerDependencies {
  eventTemplateManager: IEventTemplateManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
