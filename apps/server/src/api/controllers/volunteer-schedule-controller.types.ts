import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';

export interface VolunteerScheduleControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
}
