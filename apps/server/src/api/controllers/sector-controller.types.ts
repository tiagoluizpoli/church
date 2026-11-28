import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { ISectorManager } from '../../domain/contracts/application/sector-manager';

export interface SectorControllerDependencies {
  ministryManager: IMinistryManager;
  sectorManager: ISectorManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
