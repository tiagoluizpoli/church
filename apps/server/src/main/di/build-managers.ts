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
  DbNotificationManager,
  DbOutboxDrainer,
  DbParticipationManager,
  DbPlanningEventManager,
  DbRedemptionManager,
  DbVolunteerManager,
  DbVolunteerTransferManager,
  InvitationVerificationCodeManager,
} from '../../application';
import { ChurchNotifications } from '../../application/church-notifications';
import { buildChurchNotifier } from '../../application/church-notifier';
import { SchedulingNotificationFacts } from '../../application/scheduling-notification-facts';
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
  | 'notificationManager'
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
    unavailableShiftRepository,
    availabilityCheckRepository,
    ministryParticipationRepository,
    usualSetupRepository,
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
    sectorRepository,
    eventTimeBlockRepository,
    notificationRepository,
    unitOfWork,
  },
  services: {
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
      unavailableShiftRepository,
      cycleRepository,
      unitOfWork,
    });
  const eventManager =
    overrides.eventManager ??
    new DbEventManager({
      eventRepo: eventRepository,
      eventTimeBlockRepo: eventTimeBlockRepository,
      assignmentRepo: assignmentRepository,
      unavailableShiftRepo: unavailableShiftRepository,
      volunteerRepo: volunteerRepository,
      roleRepo: roleRepository,
      sectorRepo: sectorRepository,
      ministryParticipationRepo: ministryParticipationRepository,
      authorityManager,
      shiftRepo: shiftRepository,
    });
  const eventTemplateManager =
    overrides.eventTemplateManager ??
    new DbEventTemplateManager({ templateRepository: eventTemplateRepository });
  const notifications = new ChurchNotifications({ outboxRepository });
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
      notifications,
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
      notifications,
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
      volunteerTransferRepository,
      emailSender,
      schedulingFacts: new SchedulingNotificationFacts({
        churchRepository,
        ministryRepository,
        cycleRepository,
        participationRepository: ministryParticipationRepository,
        eventRepository: planningEventRepository,
        eventTimeBlockRepository,
        assignmentRepository,
        roleRepository,
        volunteerRepository,
      }),
      notifier: buildChurchNotifier({
        config,
        churchRepository,
        notificationRepository,
        outboxRepository,
        emailSender,
        unitOfWork,
      }),
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
      usualSetupRepository: usualSetupRepository,
      ministryRepository,
      eventTimeBlockRepository,
    });
  const volunteerManager =
    overrides.volunteerManager ??
    new DbVolunteerManager({
      volunteerRepo: volunteerRepository,
      assignmentRepo: assignmentRepository,
      unavailableShiftRepo: unavailableShiftRepository,
      notificationRepo: notificationRepository,
      eventRepo: eventRepository,
      shiftRepo: shiftRepository,
      ministryRepo: ministryRepository,
      participationRepo: ministryParticipationRepository,
      roleRepo: roleRepository,
      availabilityCheckRepo: availabilityCheckRepository,
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
      unavailableShiftRepository,
      eventTimeBlockRepository,
      volunteerRepository,
      ministryRepository,
      usualSetupRepository: usualSetupRepository,
      eventTemplateRepository,
      cycleRepository,
      roleRepository,
      sectorRepository,
      notifications,
      unitOfWork,
    });
  const availabilityCheckManager =
    overrides.availabilityCheckManager ??
    new DbAvailabilityCheckManager({
      participationRepository: ministryParticipationRepository,
      eventRepository: planningEventRepository,
      availabilityCheckRepository,
      cycleRepository,
      notifications,
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

  const notificationManager =
    overrides.notificationManager ??
    new DbNotificationManager({
      notificationRepository,
      defaultPageSize: config.notifications.pageSize,
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
    notificationManager,
  };
}
