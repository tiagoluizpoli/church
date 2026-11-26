import type { FastifyController } from '../../api/contracts/fastify-controller';
import {
  ActiveChurchController,
  AssignController,
  CallerCapabilitiesController,
  ChurchAdminController,
  ChurchSettingsController,
  EventController,
  InvitationController,
  MinistryController,
  MinistryRoleController,
  NotificationController,
  PeopleController,
  PrepareController,
  PublicChurchProfileController,
  RedemptionController,
  SectorController,
  SwapRequestController,
  SwapRequestListController,
  UsualSetupController,
  VolunteerController,
  VolunteerScheduleController,
} from '../../api/controllers';
import type { Auth } from './build-auth';
import type { Managers } from './build-managers';
import type { Services } from './build-services';
import type { CompositionRootDependencies } from './dependencies';

export interface BuildControllersInput {
  config: CompositionRootDependencies['config'];
  managers: Managers;
  services: Pick<Services, 'webShell'>;
  auth: Auth;
}

export function buildControllers({
  config,
  managers: {
    assignmentManager,
    eventManager,
    eventTemplateManager,
    ministryManager,
    ministryInvitationManager,
    ministryRoleManager,
    sectorManager,
    redemptionManager,
    volunteerTransferManager,
    cycleManager,
    planningEventManager,
    volunteerManager,
    swapRequestManager,
    swapRequestListManager,
    prepareManager,
    usualSetupManager,
    scheduleBuilderReader,
    assignmentProposalManager,
    scheduleReadModel,
    schedulePublisher,
    availabilityCheckManager,
    activeChurchSelectionManager,
    notificationManager,
    invitationListManager,
    peopleListManager,
    setupProgressManager,
    churchSettingsManager,
    publicChurchProfileManager,
    publicEventManager,
    churchAccessManager,
    ministryMembershipManager,
  },
  services: { webShell },
  auth: { authorityGuard, activeChurchResolver },
}: BuildControllersInput): FastifyController[] {
  return [
    new ActiveChurchController({
      activeChurchResolver,
      selectionManager: activeChurchSelectionManager,
    }),
    new ChurchAdminController({
      cycleManager,
      eventTemplateManager,
      planningEventManager,
      activeChurchResolver,
      ministryManager,
      setupProgressManager,
      authorityGuard,
    }),
    new ChurchSettingsController({
      churchSettingsManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new EventController({ eventManager, activeChurchResolver, authorityGuard }),
    new MinistryController({
      ministryManager,
      ministryInvitationManager,
      activeChurchResolver,
      authorityGuard,
      config,
    }),
    new MinistryRoleController({
      ministryRoleManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new SectorController({
      ministryManager,
      sectorManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new UsualSetupController({
      ministryManager,
      usualSetupManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new PrepareController({
      prepareManager,
      scheduleReadModel,
      availabilityCheckManager,
      activeChurchResolver,
      authorityGuard,
      config,
    }),
    new AssignController({
      scheduleBuilderReader,
      assignmentProposalManager,
      schedulePublisher,
      scheduleReadModel,
      assignmentManager,
      activeChurchResolver,
      authorityGuard,
      config,
    }),
    new CallerCapabilitiesController({
      activeChurchResolver,
      authorityGuard,
    }),
    new NotificationController({
      notificationManager,
      activeChurchResolver,
      authorityGuard,
      maxPageSize: config.notifications.maxPageSize,
    }),
    new InvitationController({
      invitationListManager,
      ministryInvitationManager,
      activeChurchResolver,
      authorityGuard,
      maxPageSize: config.invitations.maxPageSize,
    }),
    new PeopleController({
      peopleListManager,
      churchAccessManager,
      ministryMembershipManager,
      activeChurchResolver,
      authorityGuard,
      config,
    }),
    new RedemptionController({
      redemptionManager,
      volunteerTransferManager,
      config,
    }),
    new PublicChurchProfileController({
      publicChurchProfileManager,
      publicEventManager,
      webShell,
      config,
    }),
    new VolunteerController({ volunteerManager, activeChurchResolver }),
    new VolunteerScheduleController({ volunteerManager, activeChurchResolver }),
    new SwapRequestController({ swapRequestManager, activeChurchResolver }),
    new SwapRequestListController({
      swapRequestListManager,
      swapRequestManager,
      activeChurchResolver,
      authorityGuard,
    }),
  ];
}
