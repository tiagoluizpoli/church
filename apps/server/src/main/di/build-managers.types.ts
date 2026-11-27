import type { Auth } from './build-auth.types';
import type { Repositories } from './build-repositories.types';
import type { Services } from './build-services.types';
import type { CompositionRootDependencies } from './dependencies.types';

export type Managers = Pick<
  CompositionRootDependencies,
  | 'assignmentManager'
  | 'eventManager'
  | 'eventTemplateManager'
  | 'ministryManager'
  | 'ministryInvitationManager'
  | 'ministryRoleManager'
  | 'sectorManager'
  | 'invitationVerificationCodeManager'
  | 'redemptionManager'
  | 'volunteerTransferManager'
  | 'outboxDrainer'
  | 'cycleManager'
  | 'planningEventManager'
  | 'volunteerManager'
  | 'swapRequestManager'
  | 'swapRequestListManager'
  | 'prepareManager'
  | 'usualSetupManager'
  | 'scheduleBuilderReader'
  | 'assignmentProposalManager'
  | 'scheduleReadModel'
  | 'schedulePublisher'
  | 'availabilityCheckManager'
  | 'activeChurchSelectionManager'
  | 'notificationManager'
  | 'invitationListManager'
  | 'peopleListManager'
  | 'setupProgressManager'
  | 'churchSettingsManager'
  | 'publicChurchProfileManager'
  | 'publicEventManager'
  | 'churchAccessManager'
  | 'ministryMembershipManager'
>;

export interface BuildManagersInput {
  config: CompositionRootDependencies['config'];
  overrides: Partial<CompositionRootDependencies>;
  repositories: Repositories;
  services: Services;
  auth: Auth;
}
