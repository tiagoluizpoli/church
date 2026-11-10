import { env } from '@church/env/server';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import {
  DbActiveChurchSelectionManager,
  DbAssignmentManager,
  DbAvailabilityCheckManager,
  DbChurchAccessManager,
  DbCycleManager,
  DbEventManager,
  DbEventTemplateManager,
  DbInvitationListManager,
  DbMinistryInvitationManager,
  DbMinistryManager,
  DbMinistryMembershipManager,
  DbMinistryRoleManager,
  DbNotificationManager,
  DbOutboxDrainer,
  DbParticipationManager,
  DbPeopleListManager,
  DbPlanningEventManager,
  DbRedemptionManager,
  DbSectorManager,
  DbSwapRequestListManager,
  DbSwapRequestManager,
  DbVolunteerManager,
  DbVolunteerTransferManager,
  InvitationVerificationCodeManager,
} from '../../application';
import { ChurchNotifications } from '../../application/church-notifications';
import { buildChurchNotifier } from '../../application/church-notifier';
import { ChurchRecipients } from '../../application/church-recipients';
import { SchedulingNotificationFacts } from '../../application/scheduling-notification-facts';
import { UsualSetupStaffingSeeder } from '../../application/usual-setup-staffing-seeder';
import { ConsoleRedemptionFailureLog } from '../../infrastructure/services/console-redemption-failure-log';
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
  | 'participationManager'
  | 'availabilityCheckManager'
  | 'activeChurchSelectionManager'
  | 'notificationManager'
  | 'invitationListManager'
  | 'peopleListManager'
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
    swapRequestRepository,
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
    invitationListRepository,
    peopleListRepository,
    churchAccessRepository,
    ministryMembershipRepository,
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
      swapRequestRepo: swapRequestRepository,
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
    new DbEventTemplateManager({
      templateRepository: eventTemplateRepository,
      unitOfWork,
    });
  const notifications = new ChurchNotifications({ outboxRepository });
  const ministryManager =
    overrides.ministryManager ??
    new DbMinistryManager({
      ministryRepo: ministryRepository,
      volunteerRepo: volunteerRepository,
      invitationRepo: ministryInvitationRepository,
      unitOfWork,
    });
  const ministryRoleManager =
    overrides.ministryRoleManager ??
    new DbMinistryRoleManager({
      ministryRepository,
      roleRepository,
      unitOfWork,
    });
  const sectorManager =
    overrides.sectorManager ??
    new DbSectorManager({
      ministryRepository,
      sectorRepository,
      unitOfWork,
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
      failureLog: new ConsoleRedemptionFailureLog(),
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
        eventRepository: planningEventRepository,
        availabilityCheckRepository,
        webBaseUrl: env.CORS_ORIGIN,
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
      webBaseUrl: env.CORS_ORIGIN,
    });
  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository: ministryParticipationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });
  const cycleManager =
    overrides.cycleManager ??
    new DbCycleManager({
      cycleRepository: cycleRepository,
      eventRepository: planningEventRepository,
      churchRepository,
      unitOfWork,
      participationRepository: ministryParticipationRepository,
      staffingSeeder,
      volunteerRepository,
      notifications,
    });
  const planningEventManager =
    overrides.planningEventManager ??
    new DbPlanningEventManager({
      cycleRepository: cycleRepository,
      eventRepository: planningEventRepository,
      templateRepository: eventTemplateRepository,
      churchRepository,
      unitOfWork,
      eventTimeBlockRepository,
      recipients: new ChurchRecipients({
        churchRepository,
        volunteerRepository,
      }),
      notifications,
    });
  const volunteerManager =
    overrides.volunteerManager ??
    new DbVolunteerManager({
      volunteerRepo: volunteerRepository,
      assignmentRepo: assignmentRepository,
      swapRequestRepo: swapRequestRepository,
      unavailableShiftRepo: unavailableShiftRepository,
      notificationRepo: notificationRepository,
      cycleRepo: cycleRepository,
      eventRepo: eventRepository,
      shiftRepo: shiftRepository,
      ministryRepo: ministryRepository,
      participationRepo: ministryParticipationRepository,
      roleRepo: roleRepository,
      availabilityCheckRepo: availabilityCheckRepository,
      churchRepo: churchRepository,
      authorityManager,
      unitOfWork,
      config,
    });
  const swapRequestListManager =
    overrides.swapRequestListManager ??
    new DbSwapRequestListManager({ swapRequestRepo: swapRequestRepository });
  const swapRequestManager =
    overrides.swapRequestManager ??
    new DbSwapRequestManager({
      swapRequestRepo: swapRequestRepository,
      assignmentRepo: assignmentRepository,
      participationRepo: ministryParticipationRepository,
      shiftRepo: shiftRepository,
      eventRepo: eventRepository,
      ministryRepo: ministryRepository,
      roleRepo: roleRepository,
      churchRepo: churchRepository,
      volunteerRepo: volunteerRepository,
      recipients: new ChurchRecipients({
        churchRepository,
        volunteerRepository,
      }),
      notifications,
      authorityManager,
      unitOfWork,
      config,
    });
  const participationManager =
    overrides.participationManager ??
    new DbParticipationManager({
      availabilityCheckRepository,
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
      churchRepository,
      swapRequestRepo: swapRequestRepository,
      staffingSeeder,
      unitOfWork,
    });
  const availabilityCheckManager =
    overrides.availabilityCheckManager ??
    new DbAvailabilityCheckManager({
      participationRepository: ministryParticipationRepository,
      availabilityCheckRepository,
      cycleRepository,
      ministryRepository,
      churchRepository,
      notifications,
      unitOfWork,
      config,
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

  const invitationListManager =
    overrides.invitationListManager ??
    new DbInvitationListManager({
      invitationListRepository,
      authorityManager,
      defaultPageSize: config.invitations.pageSize,
    });

  const peopleListManager =
    overrides.peopleListManager ??
    new DbPeopleListManager({
      peopleListRepository,
      authorityManager,
      config,
    });

  const churchAccessManager =
    overrides.churchAccessManager ??
    new DbChurchAccessManager({
      authorityManager,
      churchAccessRepository,
      unitOfWork,
    });

  const ministryMembershipManager =
    overrides.ministryMembershipManager ??
    new DbMinistryMembershipManager({
      authorityManager,
      churchAccessRepository,
      membershipRepository: ministryMembershipRepository,
      roleRepository,
      unitOfWork,
    });

  return {
    assignmentManager,
    eventManager,
    eventTemplateManager,
    ministryManager,
    ministryInvitationManager,
    ministryRoleManager,
    sectorManager,
    invitationVerificationCodeManager,
    redemptionManager,
    volunteerTransferManager,
    outboxDrainer,
    cycleManager,
    planningEventManager,
    volunteerManager,
    swapRequestManager,
    swapRequestListManager,
    participationManager,
    availabilityCheckManager,
    activeChurchSelectionManager,
    notificationManager,
    invitationListManager,
    peopleListManager,
    churchAccessManager,
    ministryMembershipManager,
  };
}
