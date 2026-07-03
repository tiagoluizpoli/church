import 'reflect-metadata';
import { db } from '@church/db';
import { container } from 'tsyringe';
import { SchedulingRbacGuard } from '../../api/auth/scheduling-rbac-guard';
import { AdminLeaderController } from '../../api/controllers/admin-leader-controller';
import { ChurchAdminController } from '../../api/controllers/church-admin-controller';
import { FeatureFlagController } from '../../api/controllers/feature-flag-controller';
import { LeaderController } from '../../api/controllers/leader-controller';
import { VolunteerController } from '../../api/controllers/volunteer-controller';
import { DbAssignmentManager } from '../../application/db-assignment-manager';
import { DbAvailabilityCheckManager } from '../../application/db-availability-check-manager';
import { DbEventManager } from '../../application/db-event-manager';
import { DbEventTemplateManager } from '../../application/db-event-template-manager';
import { DbFeatureFlagManager } from '../../application/db-feature-flag-manager';
import { DbMinistryManager } from '../../application/db-ministry-manager';
import { DbParticipationManager } from '../../application/db-participation-manager';
import { DbPlanningCycleManager } from '../../application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../application/db-planning-event-manager';
import { DbSchedulingRbacManager } from '../../application/db-scheduling-rbac-manager';
import { DbVolunteerManager } from '../../application/db-volunteer-manager';
import { DrizzleSchedulingRbacResolver } from '../../infrastructure/auth/drizzle-scheduling-rbac-resolver';
import {
  DrizzleAssignmentAuditRepository,
  DrizzleAssignmentRepository,
  DrizzleAvailabilityCheckRepository,
  DrizzleAvailabilityRepository,
  DrizzleChurchRepository,
  DrizzleEventRepository,
  DrizzleEventTemplateRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleMinistryServingProfileRepository,
  DrizzlePlanningCycleRepository,
  DrizzlePlanningEventRepository,
  DrizzleRoleRepository,
  DrizzleShiftRepository,
  DrizzleTeamRepository,
  DrizzleTimeSlotRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerNotificationRepository,
  DrizzleVolunteerRepository,
} from '../../infrastructure/repositories';
import { LocalNotificationService } from '../../infrastructure/services/local-notification-service';
import { UnleashFeatureFlagService } from '../../infrastructure/services/unleash-feature-flag-service';
import { injection } from './injection-tokens';

export function registerInjections(): void {
  container.register(injection.auth.scopeRepository, {
    useFactory: () => new DrizzleSchedulingRbacResolver(db),
  });
  container.register(injection.auth.manager, {
    useClass: DbSchedulingRbacManager,
  });
  container.register(injection.auth.schedulingRbacResolver, {
    useClass: SchedulingRbacGuard,
  });
  container.register(injection.infra.eventRepository, {
    useFactory: () => new DrizzleEventRepository(db),
  });
  container.register(injection.infra.eventTemplateRepository, {
    useFactory: () => new DrizzleEventTemplateRepository(db),
  });
  container.register(injection.infra.planningCycleRepository, {
    useFactory: () => new DrizzlePlanningCycleRepository(db),
  });
  container.register(injection.infra.planningEventRepository, {
    useFactory: () => new DrizzlePlanningEventRepository(db),
  });
  container.register(injection.infra.volunteerRepository, {
    useFactory: () => new DrizzleVolunteerRepository(db),
  });
  container.register(injection.infra.assignmentRepository, {
    useFactory: () => new DrizzleAssignmentRepository(db),
  });
  container.register(injection.infra.assignmentAuditRepository, {
    useFactory: () => new DrizzleAssignmentAuditRepository(db),
  });
  container.register(injection.infra.availabilityRepository, {
    useFactory: () => new DrizzleAvailabilityRepository(db),
  });
  container.register(injection.infra.availabilityCheckRepository, {
    useFactory: () => new DrizzleAvailabilityCheckRepository(db),
  });
  container.register(injection.infra.ministryParticipationRepository, {
    useFactory: () => new DrizzleMinistryParticipationRepository(db),
  });
  container.register(injection.infra.ministryServingProfileRepository, {
    useFactory: () => new DrizzleMinistryServingProfileRepository(db),
  });
  container.register(injection.infra.shiftRepository, {
    useFactory: () => new DrizzleShiftRepository(db),
  });
  container.register(injection.infra.churchRepository, {
    useFactory: () => new DrizzleChurchRepository(db),
  });
  container.register(injection.infra.ministryRepository, {
    useFactory: () => new DrizzleMinistryRepository(db),
  });
  container.register(injection.infra.roleRepository, {
    useFactory: () => new DrizzleRoleRepository(db),
  });
  container.register(injection.infra.teamRepository, {
    useFactory: () => new DrizzleTeamRepository(db),
  });
  container.register(injection.infra.timeSlotRepository, {
    useFactory: () => new DrizzleTimeSlotRepository(db),
  });
  container.register(injection.infra.volunteerNotificationRepository, {
    useFactory: () => new DrizzleVolunteerNotificationRepository(db),
  });
  container.register(injection.infra.unitOfWork, {
    useFactory: () => new DrizzleUnitOfWork(db),
  });
  container.register(injection.infra.notificationService, {
    useClass: LocalNotificationService,
  });
  container.register(injection.infra.featureFlagService, {
    useClass: UnleashFeatureFlagService,
  });

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
  container.register(injection.managers.planningCycleManager, {
    useClass: DbPlanningCycleManager,
  });
  container.register(injection.managers.planningEventManager, {
    useClass: DbPlanningEventManager,
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

  // Controllers
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
    VolunteerController,
  );
}
