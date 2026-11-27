import { env } from '@church/env/server';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import {
  DbActiveChurchSelectionManager,
  DbAssignmentManager,
  DbAssignmentProposalManager,
  DbAvailabilityCheckManager,
  DbChurchAccessManager,
  DbChurchSettingsManager,
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
  DbParticipationReader,
  DbPeopleListManager,
  DbPlanningEventManager,
  DbPrepareManager,
  DbPublicChurchProfileManager,
  DbPublicEventManager,
  DbRedemptionManager,
  DbScheduleBuilderReader,
  DbScheduleChangeReader,
  DbSchedulePublisher,
  DbScheduleReadModel,
  DbSectorManager,
  DbSetupProgressManager,
  DbSwapRequestListManager,
  DbSwapRequestManager,
  DbUsualSetupManager,
  DbVolunteerManager,
  DbVolunteerTransferManager,
  InvitationVerificationCodeManager,
} from '../../application';
import {
  AssignmentFactsReader,
  AssignmentLifecycle,
} from '../../application/assignment-lifecycle';
import { ChurchNotifications } from '../../application/church-notifications';
import { ChurchRecipients } from '../../application/church-recipients';
import { DbChurchIdentitySnapshotter } from '../../application/db-church-identity-snapshotter';
import { SchedulingNotificationFacts } from '../../application/scheduling-notification-facts';
import { UsualSetupStaffingSeeder } from '../../application/usual-setup-staffing-seeder';
import { ConsoleRedemptionFailureLog } from '../../infrastructure/services/console-redemption-failure-log';
import type { Auth } from './build-auth';
import { buildChurchNotifier } from './build-church-notifier';
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

export function buildManagers({
  config,
  overrides,
  repositories: {
    eventRepository,
    eventTemplateRepository,
    templatePrecedenceRepository,
    cycleRepository,
    planningEventRepository,
    volunteerRepository,
    assignmentRepository,
    swapRequestRepository,
    assignmentAuditRepository,
    assignmentProposalApplicationRepository,
    unavailableShiftRepository,
    availabilityCheckRepository,
    ministryParticipationRepository,
    usualSetupRepository,
    shiftRepository,
    churchRepository,
    publicEventRepository,
    churchProgrammeRepository,
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
    setupProgressRepository,
    churchAccessRepository,
    ministryMembershipRepository,
    unitOfWork,
  },
  services: {
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
    errorReporter,
    tracing,
    objectStorage,
  },
  auth: { churchMembershipRepository, authorityManager, activeChurchResolver },
}: BuildManagersInput): Managers {
  // One instance each, shared by every manager; each call runs in the caller's transaction.
  const assignmentLifecycle = new AssignmentLifecycle({
    assignmentRepository,
    auditRepository: assignmentAuditRepository,
    swapRequestRepository,
    participationRepository: ministryParticipationRepository,
  });
  const assignmentFactsReader = new AssignmentFactsReader({
    assignmentRepository,
    shiftRepository,
    eventRepository,
    eventTimeBlockRepository,
    volunteerRepository,
    unavailableShiftRepository,
  });
  const assignmentManager =
    overrides.assignmentManager ??
    new DbAssignmentManager({
      assignmentRepo: assignmentRepository,
      auditRepo: assignmentAuditRepository,
      shiftRepository,
      participationRepository: ministryParticipationRepository,
      cycleRepository,
      assignmentLifecycle,
      assignmentFactsReader,
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
      precedenceRepository: templatePrecedenceRepository,
      unitOfWork,
    });
  const churchIdentity = new DbChurchIdentitySnapshotter({
    churchRepository,
    objectStorage,
  });
  const notifications = new ChurchNotifications({
    outboxRepository,
    churchIdentity,
  });
  const ministryManager =
    overrides.ministryManager ??
    new DbMinistryManager({
      ministryRepo: ministryRepository,
      volunteerRepo: volunteerRepository,
      invitationRepo: ministryInvitationRepository,
      unitOfWork,
      sectorRepo: sectorRepository,
      roleRepo: roleRepository,
      usualSetupRepo: usualSetupRepository,
      templateRepo: eventTemplateRepository,
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
      churchIdentity,
      config,
    });
  const invitationVerificationCodeManager =
    overrides.invitationVerificationCodeManager ??
    new InvitationVerificationCodeManager({
      repository: invitationVerificationCodeRepository,
      emailSender,
      churchIdentity,
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
      verificationCodeRepository: invitationVerificationCodeRepository,
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
      errorReporter,
      tracing,
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
      precedenceRepository: templatePrecedenceRepository,
      churchRepository,
      unitOfWork,
      eventTimeBlockRepository,
      assignmentLifecycle,
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
  const scheduleChangeReader = new DbScheduleChangeReader({
    assignmentRepository,
    eventRepository: planningEventRepository,
    participationRepository: ministryParticipationRepository,
    roleRepository,
    shiftRepository,
  });
  const participationReader = new DbParticipationReader({
    assignmentRepository,
    availabilityCheckRepository,
    ministryRepository,
    participationRepository: ministryParticipationRepository,
    roleRepository,
    sectorRepository,
    shiftRepository,
    unavailableShiftRepository,
    volunteerRepository,
  });
  const prepareManager =
    overrides.prepareManager ??
    new DbPrepareManager({
      assignmentRepository,
      churchRepository,
      cycleRepository,
      eventRepository: planningEventRepository,
      eventTimeBlockRepository,
      ministryRepository,
      participationRepository: ministryParticipationRepository,
      shiftRepository,
      staffingSeeder,
      unavailableShiftRepository,
      unitOfWork,
      participationReader,
    });
  const usualSetupManager =
    overrides.usualSetupManager ??
    new DbUsualSetupManager({
      eventTemplateRepository,
      ministryRepository,
      unitOfWork,
      usualSetupRepository,
      participationReader,
    });
  const scheduleBuilderReader =
    overrides.scheduleBuilderReader ??
    new DbScheduleBuilderReader({
      assignmentRepository,
      cycleRepository,
      eventRepository: planningEventRepository,
      ministryRepository,
      participationRepository: ministryParticipationRepository,
      roleRepository,
      shiftRepository,
      unavailableShiftRepository,
      unitOfWork,
      volunteerRepository,
      scheduleChangeReader,
      participationReader,
    });
  const assignmentProposalManager =
    overrides.assignmentProposalManager ??
    new DbAssignmentProposalManager({
      assignmentRepository,
      availabilityCheckRepository,
      cycleRepository,
      eventRepository: planningEventRepository,
      assignmentLifecycle,
      ministryRepository,
      participationRepository: ministryParticipationRepository,
      proposalApplicationRepository: assignmentProposalApplicationRepository,
      shiftRepository,
      unitOfWork,
      participationReader,
    });
  const scheduleReadModel =
    overrides.scheduleReadModel ??
    new DbScheduleReadModel({
      churchRepository,
      ministryRepository,
      participationRepository: ministryParticipationRepository,
      unitOfWork,
      scheduleChangeReader,
    });
  const schedulePublisher =
    overrides.schedulePublisher ??
    new DbSchedulePublisher({
      churchRepository,
      cycleRepository,
      eventRepository: planningEventRepository,
      ministryRepository,
      notifications,
      participationRepository: ministryParticipationRepository,
      swapRequestRepo: swapRequestRepository,
      unitOfWork,
      volunteerRepository,
      scheduleChangeReader,
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
      objectStorage,
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

  const setupProgressManager =
    overrides.setupProgressManager ??
    new DbSetupProgressManager({ setupProgressRepository });

  const churchSettingsManager =
    overrides.churchSettingsManager ??
    new DbChurchSettingsManager({
      churchRepository,
      unitOfWork,
      objectStorage,
      publicOrigin: env.CORS_ORIGIN,
    });

  const publicChurchProfileManager =
    overrides.publicChurchProfileManager ??
    new DbPublicChurchProfileManager({
      churchRepository,
      objectStorage,
      programmeRepository: churchProgrammeRepository,
    });

  const publicEventManager =
    overrides.publicEventManager ??
    new DbPublicEventManager({ publicEventRepository, churchRepository });

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
  };
}
