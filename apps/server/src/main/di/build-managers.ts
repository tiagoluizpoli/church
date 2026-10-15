import { env } from '@church/env/server';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import {
  DbActiveChurchSelectionManager,
  DbAssignmentManager,
  DbAvailabilityCheckManager,
  DbCycleManager,
  DbEventManager,
  DbEventTemplateManager,
  DbMinistryInvitationManager,
  DbMinistryManager,
  DbOutboxDrainer,
  DbParticipationManager,
  DbPlanningEventManager,
  DbRedemptionManager,
  DbVolunteerManager,
  DbVolunteerTransferManager,
  InvitationVerificationCodeManager,
} from '../../application';
import type { Auth } from './build-auth';
import type { Repositories } from './build-repositories';
import type { Services } from './build-services';
import type { CompositionRootDependencies } from './dependencies';

export type Managers = Pick<
  CompositionRootDependencies,
  | 'assignmentManager'
  | 'eventManager'
  | 'eventTemplateManager'
  | 'ministryManager'
  | 'ministryInvitationManager'
  | 'invitationVerificationCodeManager'
  | 'redemptionManager'
  | 'volunteerTransferManager'
  | 'outboxDrainer'
  | 'cycleManager'
  | 'planningEventManager'
  | 'volunteerManager'
  | 'participationManager'
  | 'availabilityCheckManager'
  | 'activeChurchSelectionManager'
>;

export interface BuildManagersInput {
  config: CompositionRootDependencies['config'];
  overrides: Partial<CompositionRootDependencies>;
  repositories: Repositories;
  services: Services;
  auth: Auth;
}

export function buildManagers({
  config,
  overrides,
  repositories: {
    eventRepository,
    eventTemplateRepository,
    cycleRepository,
    planningEventRepository,
    volunteerRepository,
    assignmentRepository,
    assignmentAuditRepository,
    availabilityRepository,
    availabilityCheckRepository,
    ministryParticipationRepository,
    ministryServingProfileRepository,
    shiftRepository,
    churchRepository,
    ministryRepository,
    invitationVerificationCodeRepository,
    redemptionRepository,
    volunteerTransferRepository,
    securityLogRepository,
    ministryInvitationRepository,
    outboxRepository,
    roleRepository,
    teamRepository,
    timeSlotRepository,
    volunteerNotificationRepository,
    unitOfWork,
  },
  services: {
    notificationService,
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
  },
  auth: { churchMembershipRepository, authorityManager, activeChurchResolver },
}: BuildManagersInput): Managers {
  const assignmentManager =
    overrides.assignmentManager ??
    new DbAssignmentManager({
      assignmentRepo: assignmentRepository,
      auditRepo: assignmentAuditRepository,
      shiftRepository,
      participationRepository: ministryParticipationRepository,
      volunteerRepository,
      availabilityRepository,
      planningEventRepository,
      notificationService,
      unitOfWork,
    });
  const eventManager =
    overrides.eventManager ??
    new DbEventManager({
      eventRepo: eventRepository,
      slotRepo: timeSlotRepository,
      assignmentRepo: assignmentRepository,
      availabilityRepo: availabilityRepository,
      volunteerRepo: volunteerRepository,
      roleRepo: roleRepository,
    });
  const eventTemplateManager =
    overrides.eventTemplateManager ??
    new DbEventTemplateManager({ templateRepository: eventTemplateRepository });
  const ministryManager =
    overrides.ministryManager ??
    new DbMinistryManager({
      ministryRepo: ministryRepository,
      volunteerRepo: volunteerRepository,
    });
  const ministryInvitationManager =
    overrides.ministryInvitationManager ??
    new DbMinistryInvitationManager({
      repo: ministryInvitationRepository,
      roleRepository,
      ministryRepository,
      authorityManager,
      unitOfWork,
      outboxRepository,
      config,
    });
  const invitationVerificationCodeManager =
    overrides.invitationVerificationCodeManager ??
    new InvitationVerificationCodeManager({
      repository: invitationVerificationCodeRepository,
      emailSender,
      verificationCodeSecret: env.BETTER_AUTH_SECRET,
      config,
    });
  const redemptionManager =
    overrides.redemptionManager ??
    new DbRedemptionManager({
      churchRepository,
      identityGateway: redemptionIdentityGateway,
      invitationRepository: ministryInvitationRepository,
      invitationVerificationCodeManager,
      redemptionRepository,
      securityLogRepository,
      unitOfWork,
      verificationCodeInspector: debugEndpointsEnabled()
        ? verificationCodeInspector
        : undefined,
    });
  const volunteerTransferManager =
    overrides.volunteerTransferManager ??
    new DbVolunteerTransferManager({
      churchRepository,
      identityGateway: redemptionIdentityGateway,
      invitationRepository: ministryInvitationRepository,
      securityLogRepository,
      unitOfWork,
      volunteerRepository,
      volunteerTransferRepository,
    });
  const outboxDrainer =
    overrides.outboxDrainer ??
    new DbOutboxDrainer({
      outboxRepository,
      invitationRepository: ministryInvitationRepository,
      churchRepository,
      ministryRepository,
      roleRepository,
      volunteerRepository,
      volunteerTransferRepository,
      emailSender,
      unitOfWork,
      config,
    });
  const cycleManager =
    overrides.cycleManager ??
    new DbCycleManager({
      cycleRepository: cycleRepository,
      eventRepository: planningEventRepository,
      churchRepository,
      unitOfWork,
    });
  const planningEventManager =
    overrides.planningEventManager ??
    new DbPlanningEventManager({
      cycleRepository: cycleRepository,
      eventRepository: planningEventRepository,
      templateRepository: eventTemplateRepository,
      churchRepository,
      unitOfWork,
      participationRepository: ministryParticipationRepository,
      shiftRepository,
      servingProfileRepository: ministryServingProfileRepository,
      ministryRepository,
      timeSlotRepository,
    });
  const volunteerManager =
    overrides.volunteerManager ??
    new DbVolunteerManager({
      volunteerRepo: volunteerRepository,
      assignmentRepo: assignmentRepository,
      availabilityRepo: availabilityRepository,
      notificationRepo: volunteerNotificationRepository,
      eventRepo: eventRepository,
      shiftRepo: shiftRepository,
      ministryRepo: ministryRepository,
      participationRepo: ministryParticipationRepository,
      roleRepo: roleRepository,
      teamRepo: teamRepository,
      availabilityCheckRepo: availabilityCheckRepository,
      notificationService,
      unitOfWork,
      config,
    });
  const participationManager =
    overrides.participationManager ??
    new DbParticipationManager({
      participationRepository: ministryParticipationRepository,
      shiftRepository,
      eventRepository: planningEventRepository,
      assignmentRepository,
      availabilityRepository,
      timeSlotRepository,
      volunteerRepository,
      ministryRepository,
      servingProfileRepository: ministryServingProfileRepository,
      roleRepository,
      notificationService,
      unitOfWork,
    });
  const availabilityCheckManager =
    overrides.availabilityCheckManager ??
    new DbAvailabilityCheckManager({
      participationRepository: ministryParticipationRepository,
      eventRepository: planningEventRepository,
      availabilityCheckRepository,
      notificationService,
      unitOfWork,
    });
  const activeChurchSelectionManager =
    overrides.activeChurchSelectionManager ??
    new DbActiveChurchSelectionManager({
      membershipRepository: churchMembershipRepository,
      authorityManager,
      activeChurchResolver,
      churchRepository,
    });

  return {
    assignmentManager,
    eventManager,
    eventTemplateManager,
    ministryManager,
    ministryInvitationManager,
    invitationVerificationCodeManager,
    redemptionManager,
    volunteerTransferManager,
    outboxDrainer,
    cycleManager,
    planningEventManager,
    volunteerManager,
    participationManager,
    availabilityCheckManager,
    activeChurchSelectionManager,
  };
}
