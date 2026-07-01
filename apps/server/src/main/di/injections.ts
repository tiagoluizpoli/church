import 'reflect-metadata';
import { db } from '@church/db';
import { container } from 'tsyringe';
import {
  DrizzleAssignmentAuditRepository,
  DrizzleAssignmentRepository,
  DrizzleAvailabilityRepository,
  DrizzleChurchRepository,
  DrizzleEventRepository,
  DrizzleMinistryRepository,
  DrizzleRoleRepository,
  DrizzleRoleTemplateRepository,
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
  container.register(injection.infra.eventRepository, {
    useFactory: () => new DrizzleEventRepository(db),
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
  container.register(injection.infra.churchRepository, {
    useFactory: () => new DrizzleChurchRepository(db),
  });
  container.register(injection.infra.ministryRepository, {
    useFactory: () => new DrizzleMinistryRepository(db),
  });
  container.register(injection.infra.roleRepository, {
    useFactory: () => new DrizzleRoleRepository(db),
  });
  container.register(injection.infra.roleTemplateRepository, {
    useFactory: () => new DrizzleRoleTemplateRepository(db),
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
}
