import type { FastifyController } from '../../api/contracts/fastify-controller';
import {
  ActiveChurchController,
  ChurchAdminController,
  EventController,
  MinistryController,
  RedemptionController,
  RosteringController,
  SchedulingCapabilityController,
  TailoringController,
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
    planningCycleManager,
    planningEventManager,
    volunteerManager,
    participationManager,
    availabilityCheckManager,
    activeChurchSelectionManager,
  },
  auth: { authorityGuard, activeChurchResolver },
}: BuildControllersInput): FastifyController[] {
  return [
    new ActiveChurchController({
      activeChurchResolver,
      selectionManager: activeChurchSelectionManager,
    }),
    new ChurchAdminController({
      planningCycleManager,
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
    new TailoringController({
      participationManager,
      availabilityCheckManager,
      activeChurchResolver,
      authorityGuard,
    }),
    new RosteringController({
      participationManager,
      assignmentManager,
      activeChurchResolver,
      authorityGuard,
      config,
    }),
    new SchedulingCapabilityController({
      activeChurchResolver,
      authorityGuard,
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
