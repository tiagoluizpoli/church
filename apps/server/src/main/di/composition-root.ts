import { type AppConfig, appConfig } from '@church/app-config';
import { db } from '@church/db';
import { env } from '@church/env/server';
import { AuthorityGuard } from '../../api/auth/authority-guard';
import type { FastifyController } from '../../api/contracts/fastify-controller';
import { ActiveChurchController } from '../../api/controllers/active-church-controller';
import { ChurchAdminController } from '../../api/controllers/church-admin-controller';
import { EventController } from '../../api/controllers/event-controller';
import { MinistryController } from '../../api/controllers/ministry-controller';
import { RedemptionController } from '../../api/controllers/redemption-controller';
import { RosteringController } from '../../api/controllers/rostering-controller';
import { SchedulingCapabilityController } from '../../api/controllers/scheduling-capability-controller';
import { TailoringController } from '../../api/controllers/tailoring-controller';
import { VolunteerController } from '../../api/controllers/volunteer-controller';
import { VolunteerScheduleController } from '../../api/controllers/volunteer-schedule-controller';
import { debugEndpointsEnabled } from '../../api/utils/debug-endpoints';
import { DbActiveChurchResolver } from '../../application/db-active-church-resolver';
import { DbActiveChurchSelectionManager } from '../../application/db-active-church-selection-manager';
import { DbAssignmentManager } from '../../application/db-assignment-manager';
import { DbAuthorityManager } from '../../application/db-authority-manager';
import { DbAvailabilityCheckManager } from '../../application/db-availability-check-manager';
import { DbEventManager } from '../../application/db-event-manager';
import { DbEventTemplateManager } from '../../application/db-event-template-manager';
import { DbMinistryInvitationManager } from '../../application/db-ministry-invitation-manager';
import { DbMinistryManager } from '../../application/db-ministry-manager';
import { DbOutboxDrainer } from '../../application/db-outbox-drainer';
import { DbParticipationManager } from '../../application/db-participation-manager';
import { DbPlanningCycleManager } from '../../application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../application/db-planning-event-manager';
import { DbRedemptionManager } from '../../application/db-redemption-manager';
import { DbVolunteerManager } from '../../application/db-volunteer-manager';
import { DbVolunteerTransferManager } from '../../application/db-volunteer-transfer-manager';
import { InvitationVerificationCodeManager } from '../../application/invitation-verification-code-manager';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IAuthorityManager } from '../../domain/contracts/application/authority-manager';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { InvitationVerificationCodeManager as IInvitationVerificationCodeManager } from '../../domain/contracts/application/invitation-verification-code-manager';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IOutboxDrainer } from '../../domain/contracts/application/outbox-drainer';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { IPlanningCycleManager } from '../../domain/contracts/application/planning-cycle-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { VolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';
import type { AssignmentRepository } from '../../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../../domain/contracts/infrastructure/assignment-audit.repository';
import type { AuthorityActorRepository } from '../../domain/contracts/infrastructure/authority-actor.repository';
import type { AvailabilityRepository } from '../../domain/contracts/infrastructure/availability.repository';
import type { AvailabilityCheckRepository } from '../../domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '../../domain/contracts/infrastructure/church.repository';
import type { ChurchMembershipRepository } from '../../domain/contracts/infrastructure/church-membership.repository';
import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import type { EventRepository } from '../../domain/contracts/infrastructure/event.repository';
import type { EventTemplateRepository } from '../../domain/contracts/infrastructure/event-template.repository';
import type { InvitationVerificationCodeRepository } from '../../domain/contracts/infrastructure/invitation-verification-code.repository';
import type { MinistryRepository } from '../../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../../domain/contracts/infrastructure/ministry-invitation.repository';
import type { MinistryParticipationRepository } from '../../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryServingProfileRepository } from '../../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { NotificationService } from '../../domain/contracts/infrastructure/notification-service';
import type { OutboxRepository } from '../../domain/contracts/infrastructure/outbox.repository';
import type { PlanningCycleRepository } from '../../domain/contracts/infrastructure/planning-cycle.repository';
import type { PlanningEventRepository } from '../../domain/contracts/infrastructure/planning-event.repository';
import type { RedemptionRepository } from '../../domain/contracts/infrastructure/redemption.repository';
import type { RedemptionIdentityGateway } from '../../domain/contracts/infrastructure/redemption-identity-gateway';
import type { RoleRepository } from '../../domain/contracts/infrastructure/role.repository';
import type { SchedulingScopeRepository } from '../../domain/contracts/infrastructure/scheduling-scope.repository';
import type { SecurityLogRepository } from '../../domain/contracts/infrastructure/security-log.repository';
import type { ShiftRepository } from '../../domain/contracts/infrastructure/shift.repository';
import type { TeamRepository } from '../../domain/contracts/infrastructure/team.repository';
import type { TimeSlotRepository } from '../../domain/contracts/infrastructure/time-slot.repository';
import type { UnitOfWork } from '../../domain/contracts/infrastructure/unit-of-work';
import type { VerificationCodeInspector } from '../../domain/contracts/infrastructure/verification-code-inspector';
import type { VolunteerRepository } from '../../domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerNotificationRepository } from '../../domain/contracts/infrastructure/volunteer-notification.repository';
import type { VolunteerTransferRepository } from '../../domain/contracts/infrastructure/volunteer-transfer.repository';
import { DrizzleAuthorityActorResolver } from '../../infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '../../infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '../../infrastructure/auth/drizzle-scheduling-scope-resolver';
import {
  DrizzleAssignmentAuditRepository,
  DrizzleAssignmentRepository,
  DrizzleAvailabilityCheckRepository,
  DrizzleAvailabilityRepository,
  DrizzleChurchRepository,
  DrizzleEventRepository,
  DrizzleEventTemplateRepository,
  DrizzleInvitationVerificationCodeRepository,
  DrizzleMinistryInvitationRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleMinistryServingProfileRepository,
  DrizzleOutboxRepository,
  DrizzlePlanningCycleRepository,
  DrizzlePlanningEventRepository,
  DrizzleRedemptionRepository,
  DrizzleRoleRepository,
  DrizzleSecurityLogRepository,
  DrizzleShiftRepository,
  DrizzleTeamRepository,
  DrizzleTimeSlotRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerNotificationRepository,
  DrizzleVolunteerRepository,
  DrizzleVolunteerTransferRepository,
} from '../../infrastructure/repositories';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { LocalNotificationService } from '../../infrastructure/services/local-notification-service';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';

export interface CompositionRootDependencies {
  config: AppConfig;
  db: typeof db;
  // Repositories
  eventRepository: EventRepository;
  eventTemplateRepository: EventTemplateRepository;
  planningCycleRepository: PlanningCycleRepository;
  planningEventRepository: PlanningEventRepository;
  volunteerRepository: VolunteerRepository;
  assignmentRepository: AssignmentRepository;
  assignmentAuditRepository: AssignmentAuditRepository;
  availabilityRepository: AvailabilityRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  invitationVerificationCodeRepository: InvitationVerificationCodeRepository;
  ministryInvitationRepository: MinistryInvitationRepository;
  redemptionRepository: RedemptionRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
  securityLogRepository: SecurityLogRepository;
  outboxRepository: OutboxRepository;
  ministryParticipationRepository: MinistryParticipationRepository;
  ministryServingProfileRepository: MinistryServingProfileRepository;
  shiftRepository: ShiftRepository;
  roleRepository: RoleRepository;
  teamRepository: TeamRepository;
  timeSlotRepository: TimeSlotRepository;
  volunteerNotificationRepository: VolunteerNotificationRepository;
  unitOfWork: UnitOfWork;
  // Services
  notificationService: NotificationService;
  emailSender: EmailSender;
  redemptionIdentityGateway: RedemptionIdentityGateway;
  /** Non-production only; set alongside a capturing `emailSender`. */
  verificationCodeInspector: VerificationCodeInspector;
  // Auth
  scopeRepository: SchedulingScopeRepository;
  authorityActorRepository: AuthorityActorRepository;
  authorityManager: IAuthorityManager;
  authorityGuard: AuthorityGuard;
  churchMembershipRepository: ChurchMembershipRepository;
  activeChurchResolver: IActiveChurchResolver;
  // Managers
  eventManager: IEventManager;
  eventTemplateManager: IEventTemplateManager;
  planningCycleManager: IPlanningCycleManager;
  planningEventManager: IPlanningEventManager;
  volunteerManager: IVolunteerManager;
  assignmentManager: IAssignmentManager;
  availabilityCheckManager: IAvailabilityCheckManager;
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  invitationVerificationCodeManager: IInvitationVerificationCodeManager;
  redemptionManager: RedemptionManager;
  volunteerTransferManager: VolunteerTransferManager;
  outboxDrainer: IOutboxDrainer;
  participationManager: IParticipationManager;
  activeChurchSelectionManager: IActiveChurchSelectionManager;
}

interface CompositionRoot {
  controllers: FastifyController[];
  outboxDrainer: IOutboxDrainer;
}

export function createCompositionRoot(
  overrides: Partial<CompositionRootDependencies> = {},
): CompositionRoot {
  const config = overrides.config ?? appConfig;
  const database = overrides.db ?? db;

  // Repositories
  const eventRepository =
    overrides.eventRepository ?? new DrizzleEventRepository({ db: database });
  const eventTemplateRepository =
    overrides.eventTemplateRepository ??
    new DrizzleEventTemplateRepository({ db: database });
  const planningCycleRepository =
    overrides.planningCycleRepository ??
    new DrizzlePlanningCycleRepository({ db: database });
  const planningEventRepository =
    overrides.planningEventRepository ??
    new DrizzlePlanningEventRepository({ db: database });
  const volunteerRepository =
    overrides.volunteerRepository ??
    new DrizzleVolunteerRepository({ db: database });
  const assignmentRepository =
    overrides.assignmentRepository ??
    new DrizzleAssignmentRepository({ db: database });
  const assignmentAuditRepository =
    overrides.assignmentAuditRepository ??
    new DrizzleAssignmentAuditRepository({ db: database });
  const availabilityRepository =
    overrides.availabilityRepository ??
    new DrizzleAvailabilityRepository({ db: database });
  const availabilityCheckRepository =
    overrides.availabilityCheckRepository ??
    new DrizzleAvailabilityCheckRepository({ db: database });
  const ministryParticipationRepository =
    overrides.ministryParticipationRepository ??
    new DrizzleMinistryParticipationRepository({ db: database });
  const ministryServingProfileRepository =
    overrides.ministryServingProfileRepository ??
    new DrizzleMinistryServingProfileRepository({ db: database });
  const shiftRepository =
    overrides.shiftRepository ?? new DrizzleShiftRepository({ db: database });
  const churchRepository =
    overrides.churchRepository ?? new DrizzleChurchRepository({ db: database });
  const ministryRepository =
    overrides.ministryRepository ??
    new DrizzleMinistryRepository({ db: database });
  const invitationVerificationCodeRepository =
    overrides.invitationVerificationCodeRepository ??
    new DrizzleInvitationVerificationCodeRepository({ db: database, config });
  const redemptionRepository =
    overrides.redemptionRepository ??
    new DrizzleRedemptionRepository({ db: database, volunteerRepository });
  const volunteerTransferRepository =
    overrides.volunteerTransferRepository ??
    new DrizzleVolunteerTransferRepository({ db: database });
  const securityLogRepository =
    overrides.securityLogRepository ??
    new DrizzleSecurityLogRepository({ db: database });
  const ministryInvitationRepository =
    overrides.ministryInvitationRepository ??
    new DrizzleMinistryInvitationRepository({ db: database, config });
  const outboxRepository =
    overrides.outboxRepository ?? new DrizzleOutboxRepository({ db: database });
  const roleRepository =
    overrides.roleRepository ?? new DrizzleRoleRepository({ db: database });
  const teamRepository =
    overrides.teamRepository ?? new DrizzleTeamRepository({ db: database });
  const timeSlotRepository =
    overrides.timeSlotRepository ??
    new DrizzleTimeSlotRepository({ db: database });
  const volunteerNotificationRepository =
    overrides.volunteerNotificationRepository ??
    new DrizzleVolunteerNotificationRepository({ db: database });
  const unitOfWork =
    overrides.unitOfWork ?? new DrizzleUnitOfWork({ db: database });

  // Services
  const notificationService =
    overrides.notificationService ??
    new LocalNotificationService({
      volunteerNotificationRepo: volunteerNotificationRepository,
    });
  const redemptionIdentityGateway =
    overrides.redemptionIdentityGateway ??
    new BetterAuthRedemptionIdentityGateway();
  // One shared capture instance outside production: the redemption debug route
  // reads back what the verification-code manager just sent through it.
  const isProduction = env.NODE_ENV === 'production';
  const captureEmailSender = isProduction
    ? undefined
    : new CaptureEmailSender();
  const emailSender =
    overrides.emailSender ??
    captureEmailSender ??
    new ResendEmailSender({
      apiKey: env.RESEND_API_KEY ?? '',
      from: env.RESEND_FROM_EMAIL,
    });
  const verificationCodeInspector =
    overrides.verificationCodeInspector ??
    (emailSender instanceof CaptureEmailSender
      ? emailSender
      : captureEmailSender);

  // Auth
  const scopeRepository =
    overrides.scopeRepository ??
    new DrizzleSchedulingScopeResolver({ db: database });
  const authorityActorRepository =
    overrides.authorityActorRepository ??
    new DrizzleAuthorityActorResolver({ db: database });
  const churchMembershipRepository =
    overrides.churchMembershipRepository ??
    new DrizzleChurchMembershipRepository({ db: database });
  const authorityManager =
    overrides.authorityManager ??
    new DbAuthorityManager({
      actorRepository: authorityActorRepository,
      scopeRepository,
      eventRepository,
      timeSlotRepository,
      ministryRepository,
      teamRepository,
    });
  const authorityGuard =
    overrides.authorityGuard ??
    new AuthorityGuard({ manager: authorityManager });
  const activeChurchResolver =
    overrides.activeChurchResolver ??
    new DbActiveChurchResolver({
      actorRepository: authorityActorRepository,
      membershipRepository: churchMembershipRepository,
      churchRepository,
      unitOfWork,
    });

  // Managers
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
  const planningCycleManager =
    overrides.planningCycleManager ??
    new DbPlanningCycleManager({
      cycleRepository: planningCycleRepository,
      eventRepository: planningEventRepository,
      churchRepository,
      unitOfWork,
    });
  const planningEventManager =
    overrides.planningEventManager ??
    new DbPlanningEventManager({
      cycleRepository: planningCycleRepository,
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

  const controllers: FastifyController[] = [
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

  return { controllers, outboxDrainer };
}
