import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IInvitationListManager } from '../../domain/contracts/application/invitation-list-manager';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface InvitationControllerDependencies {
  invitationListManager: IInvitationListManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
  /** Most invitations one page may ask for (validated central config). */
  maxPageSize: number;
}
