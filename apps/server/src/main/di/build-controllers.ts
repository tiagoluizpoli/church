import type { FastifyController } from '../../api/contracts/fastify-controller';
import {
  ActiveChurchController,
  AssignController,
  CallerCapabilitiesController,
  ChurchAdminController,
  EventController,
  MinistryController,
  NotificationController,
  PrepareController,
  RedemptionController,
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
    redemptionManager,
    volunteerTransferManager,
    cycleManager,
    planningEventManager,
    volunteerManager,
    participationManager,
    availabilityCheckManager,
    activeChurchSelectionManager,
    notificationManager,
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
      participationManager,
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
      maxPageSize: config.notifications.maxPageSize,
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
