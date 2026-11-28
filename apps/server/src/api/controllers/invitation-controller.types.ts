import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IInvitationListManager } from '../../domain/contracts/application/invitation-list-manager';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';

/** The page size the route's own schema bounds by the configured maximum. */
export interface ListLimitQuery {
  limit?: number;
}

export interface InvitationControllerDependencies {
  invitationListManager: IInvitationListManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  /** Most invitations one page may ask for (validated central config). */
  maxPageSize: number;
}
