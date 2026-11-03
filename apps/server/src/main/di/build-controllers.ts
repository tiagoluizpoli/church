import type { FastifyController } from '../../api/contracts/fastify-controller';
import {
  ActiveChurchController,
  AssignController,
  CallerCapabilitiesController,
  ChurchAdminController,
  EventController,
  InvitationController,
  MinistryController,
  MinistryRoleController,
  NotificationController,
  PeopleController,
  PrepareController,
  RedemptionController,
  SectorController,
  UsualSetupController,
  VolunteerController,
  VolunteerScheduleController,
} from '../../api/controllers';
import type { Auth } from './build-auth';
import type { Managers } from './build-managers';
import type { CompositionRootDependencies } from './dependencies';

export interface BuildControllersInput {
  config: CompositionRootDependencies['config'];
  managers: Managers;
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
    participationManager,
    availabilityCheckManager,
    activeChurchSelectionManager,
    notificationManager,
    invitationListManager,
    peopleListManager,
    churchAccessManager,
    ministryMembershipManager,
  },
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
      authorityGuard,
    }),
    new EventController({ eventManager, activeChurchResolver, authorityGuard }),
    new MinistryController({
      ministryManager,
      ministryInvitationManager,
      activeChurchResolver,
      authorityGuard,
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
      participationManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new PrepareController({
      participationManager,
      availabilityCheckManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new AssignController({
      participationManager,
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
    new VolunteerController({ volunteerManager, activeChurchResolver, config }),
    new VolunteerScheduleController({ volunteerManager, activeChurchResolver }),
  ];
}
