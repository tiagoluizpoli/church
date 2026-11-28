import type { AppConfig } from '@church/app-config';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface MinistryControllerDependencies {
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
  config: Pick<AppConfig, 'ministries'>;
}
