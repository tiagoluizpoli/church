import type { AppConfig } from '@church/app-config';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IChurchAccessManager } from '../../domain/contracts/application/church-access-manager';
import type { IMinistryMembershipManager } from '../../domain/contracts/application/ministry-membership-manager';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface PeopleControllerDependencies {
  peopleListManager: IPeopleListManager;
  churchAccessManager: IChurchAccessManager;
  ministryMembershipManager: IMinistryMembershipManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
  config: Pick<AppConfig, 'people'>;
}
