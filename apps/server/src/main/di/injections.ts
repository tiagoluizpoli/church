import 'reflect-metadata';
import { db } from '@church/db';
import { env } from '@church/env/server';
import { container } from 'tsyringe';
import { AuthorityGuard } from '../../api/auth/authority-guard';
import { ActiveChurchController } from '../../api/controllers/active-church-controller';
import { AdminLeaderController } from '../../api/controllers/admin-leader-controller';
import { ChurchAdminController } from '../../api/controllers/church-admin-controller';
import { FeatureFlagController } from '../../api/controllers/feature-flag-controller';
import { LeaderController } from '../../api/controllers/leader-controller';
import { LeaderRosteringController } from '../../api/controllers/leader-rostering-controller';
import { RedemptionController } from '../../api/controllers/redemption-controller';
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
import { DbFeatureFlagManager } from '../../application/db-feature-flag-manager';
import { DbMinistryInvitationManager } from '../../application/db-ministry-invitation-manager';
import { DbMinistryManager } from '../../application/db-ministry-manager';
import { DbOutboxDrainer } from '../../application/db-outbox-drainer';
import { DbParticipationManager } from '../../application/db-participation-manager';
import { DbPlanningCycleManager } from '../../application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../application/db-planning-event-manager';
import { DbRedemptionManager } from '../../application/db-redemption-manager';
import { DbVolunteerManager } from '../../application/db-volunteer-manager';
import { InvitationVerificationCodeManager } from '../../application/invitation-verification-code-manager';
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
} from '../../infrastructure/repositories';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { LocalNotificationService } from '../../infrastructure/services/local-notification-service';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import { UnleashFeatureFlagService } from '../../infrastructure/services/unleash-feature-flag-service';
import { injection } from './injection-tokens';

export function registerInjections(): void {
  container.register(injection.infra.redemptionIdentityGateway, {
    useClass: BetterAuthRedemptionIdentityGateway,
  });
  container.register(injection.auth.scopeRepository, {
    useFactory: () => new DrizzleSchedulingScopeResolver({ db }),
  });
  container.register(injection.auth.authorityActorRepository, {
    useFactory: () => new DrizzleAuthorityActorResolver({ db }),
  });
  container.register(injection.auth.authorityManager, {
    useClass: DbAuthorityManager,
  });
  container.register(injection.auth.authorityGuard, {
    useClass: AuthorityGuard,
  });
  container.register(injection.auth.churchMembershipRepository, {
    useFactory: () => new DrizzleChurchMembershipRepository({ db }),
  });
  container.register(injection.auth.activeChurchResolver, {
    useClass: DbActiveChurchResolver,
  });
  container.register(injection.infra.eventRepository, {
    useFactory: () => new DrizzleEventRepository({ db }),
  });
  container.register(injection.infra.eventTemplateRepository, {
    useFactory: () => new DrizzleEventTemplateRepository({ db }),
  });
  container.register(injection.infra.planningCycleRepository, {
    useFactory: () => new DrizzlePlanningCycleRepository({ db }),
  });
  container.register(injection.infra.planningEventRepository, {
    useFactory: () => new DrizzlePlanningEventRepository({ db }),
  });
  container.register(injection.infra.volunteerRepository, {
    useFactory: () => new DrizzleVolunteerRepository({ db }),
  });
  container.register(injection.infra.assignmentRepository, {
    useFactory: () => new DrizzleAssignmentRepository({ db }),
  });
  container.register(injection.infra.assignmentAuditRepository, {
    useFactory: () => new DrizzleAssignmentAuditRepository({ db }),
  });
  container.register(injection.infra.availabilityRepository, {
    useFactory: () => new DrizzleAvailabilityRepository({ db }),
  });
  container.register(injection.infra.availabilityCheckRepository, {
    useFactory: () => new DrizzleAvailabilityCheckRepository({ db }),
  });
  container.register(injection.infra.ministryParticipationRepository, {
    useFactory: () => new DrizzleMinistryParticipationRepository({ db }),
  });
  container.register(injection.infra.ministryServingProfileRepository, {
    useFactory: () => new DrizzleMinistryServingProfileRepository({ db }),
  });
  container.register(injection.infra.shiftRepository, {
    useFactory: () => new DrizzleShiftRepository({ db }),
  });
  container.register(injection.infra.churchRepository, {
    useFactory: () => new DrizzleChurchRepository({ db }),
  });
  container.register(injection.infra.ministryRepository, {
    useFactory: () => new DrizzleMinistryRepository({ db }),
  });
  container.register(injection.infra.invitationVerificationCodeRepository, {
    useFactory: () => new DrizzleInvitationVerificationCodeRepository({ db }),
  });
  container.register(injection.infra.redemptionRepository, {
    useFactory: () =>
      new DrizzleRedemptionRepository({
        db,
        volunteerRepository: container.resolve(
          injection.infra.volunteerRepository,
        ),
      }),
  });
  container.register(injection.infra.securityLogRepository, {
    useFactory: () => new DrizzleSecurityLogRepository({ db }),
  });
  container.register(injection.infra.ministryInvitationRepository, {
    useFactory: () => new DrizzleMinistryInvitationRepository({ db }),
  });
  container.register(injection.infra.outboxRepository, {
    useFactory: () => new DrizzleOutboxRepository({ db }),
  });
  container.register(injection.infra.roleRepository, {
    useFactory: () => new DrizzleRoleRepository({ db }),
  });
  container.register(injection.infra.teamRepository, {
    useFactory: () => new DrizzleTeamRepository({ db }),
  });
  container.register(injection.infra.timeSlotRepository, {
    useFactory: () => new DrizzleTimeSlotRepository({ db }),
  });
  container.register(injection.infra.volunteerNotificationRepository, {
    useFactory: () => new DrizzleVolunteerNotificationRepository({ db }),
  });
  container.register(injection.infra.unitOfWork, {
    useFactory: () => new DrizzleUnitOfWork({ db }),
  });
  container.register(injection.infra.notificationService, {
    useClass: LocalNotificationService,
  });
  container.registerSingleton(
    injection.infra.featureFlagService,
    UnleashFeatureFlagService,
  );
  if (env.NODE_ENV === 'production') {
    container.register(injection.infra.emailSender, {
      useFactory: () =>
        new ResendEmailSender({
          apiKey: env.RESEND_API_KEY ?? '',
          from: env.RESEND_FROM_EMAIL,
        }),
    });
  } else {
    // One shared instance outside production: the redemption debug route
    // reads back what the verification-code manager just sent through it.
    const captureEmailSender = new CaptureEmailSender();
    container.registerInstance(injection.infra.emailSender, captureEmailSender);
    container.registerInstance(
      injection.infra.verificationCodeInspector,
      captureEmailSender,
    );
  }

  // Managers
  container.register(injection.managers.assignmentManager, {
    useClass: DbAssignmentManager,
  });
  container.register(injection.managers.eventManager, {
    useClass: DbEventManager,
  });
  container.register(injection.managers.eventTemplateManager, {
    useClass: DbEventTemplateManager,
  });
  container.register(injection.managers.ministryManager, {
    useClass: DbMinistryManager,
  });
  container.register(injection.managers.ministryInvitationManager, {
    useClass: DbMinistryInvitationManager,
  });
  container.register(injection.managers.invitationVerificationCodeManager, {
    useFactory: () =>
      new InvitationVerificationCodeManager({
        repository: container.resolve(
          injection.infra.invitationVerificationCodeRepository,
        ),
        emailSender: container.resolve(injection.infra.emailSender),
        verificationCodeSecret: env.BETTER_AUTH_SECRET,
      }),
  });
  container.register(injection.managers.redemptionManager, {
    useFactory: () =>
      new DbRedemptionManager({
        identityGateway: container.resolve(
          injection.infra.redemptionIdentityGateway,
        ),
        invitationRepository: container.resolve(
          injection.infra.ministryInvitationRepository,
        ),
        invitationVerificationCodeManager: container.resolve(
          injection.managers.invitationVerificationCodeManager,
        ),
        redemptionRepository: container.resolve(
          injection.infra.redemptionRepository,
        ),
        securityLogRepository: container.resolve(
          injection.infra.securityLogRepository,
        ),
        unitOfWork: container.resolve(injection.infra.unitOfWork),
        verificationCodeInspector: debugEndpointsEnabled()
          ? container.resolve(injection.infra.verificationCodeInspector)
          : undefined,
      }),
  });
  container.register(injection.managers.outboxDrainer, {
    useFactory: () =>
      new DbOutboxDrainer({
        outboxRepository: container.resolve(injection.infra.outboxRepository),
        invitationRepository: container.resolve(
          injection.infra.ministryInvitationRepository,
        ),
        churchRepository: container.resolve(injection.infra.churchRepository),
        ministryRepository: container.resolve(
          injection.infra.ministryRepository,
        ),
        roleRepository: container.resolve(injection.infra.roleRepository),
        emailSender: container.resolve(injection.infra.emailSender),
        unitOfWork: container.resolve(injection.infra.unitOfWork),
      }),
  });
  container.register(injection.managers.planningCycleManager, {
    useClass: DbPlanningCycleManager,
  });
  container.register(injection.managers.planningEventManager, {
    useClass: DbPlanningEventManager,
  });
  container.register(injection.config.assignmentCancelLeadTimeDays, {
    useValue: env.ASSIGNMENT_CANCEL_LEAD_TIME_DAYS,
  });
  container.register(injection.managers.volunteerManager, {
    useClass: DbVolunteerManager,
  });
  container.register(injection.managers.participationManager, {
    useClass: DbParticipationManager,
  });
  container.register(injection.managers.availabilityCheckManager, {
    useClass: DbAvailabilityCheckManager,
  });
  container.register(injection.managers.featureFlagManager, {
    useClass: DbFeatureFlagManager,
  });
  container.register(injection.managers.activeChurchSelectionManager, {
    useClass: DbActiveChurchSelectionManager,
  });

  // Controllers
  container.registerSingleton(
    injection.controllers.fastify,
    ActiveChurchController,
  );
  container.registerSingleton(
    injection.controllers.fastify,
    AdminLeaderController,
  );
  container.registerSingleton(
    injection.controllers.fastify,
    ChurchAdminController,
  );
  container.registerSingleton(
    injection.controllers.fastify,
    FeatureFlagController,
  );
  container.registerSingleton(injection.controllers.fastify, LeaderController);
  container.registerSingleton(
    injection.controllers.fastify,
    LeaderRosteringController,
  );
  container.register(injection.controllers.fastify, {
    useFactory: () =>
      new RedemptionController({
        redemptionManager: container.resolve(
          injection.managers.redemptionManager,
        ),
      }),
  });
  container.registerSingleton(
    injection.controllers.fastify,
    VolunteerController,
  );
  container.registerSingleton(
    injection.controllers.fastify,
    VolunteerScheduleController,
  );
}
