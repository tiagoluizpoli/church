import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface VolunteerControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
}
