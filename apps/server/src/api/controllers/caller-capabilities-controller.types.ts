import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

/**
 * Resolves navigation capability for the Active Church. This response never
 * authorizes resource access; protected routes continue through AuthorityService.
 */
export interface CallerCapabilitiesControllerDependencies {
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
}
