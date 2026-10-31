import { type AppConfig, appConfig } from '@church/app-config';
import { ChurchNotifications } from '@/application/church-notifications';
import {
  buildChurchNotifier,
  type ChurchNotifier,
} from '@/application/church-notifier';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryInvitationManager } from '@/application/db-ministry-invitation-manager';
import { SchedulingNotificationFacts } from '@/application/scheduling-notification-facts';
import type { EmailSender } from '@/domain/contracts/infrastructure/email-sender';
import type { NotificationRepository } from '@/domain/contracts/infrastructure/notification.repository';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import {
  DrizzleAssignmentRepository,
  DrizzleChurchRepository,
  DrizzleCycleRepository,
  DrizzleEventRepository,
  DrizzleEventTimeBlockRepository,
  DrizzleMinistryInvitationRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleNotificationRepository,
  DrizzleOutboxRepository,
  DrizzlePlanningEventRepository,
  DrizzleRoleRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
  DrizzleVolunteerTransferRepository,
} from '@/infrastructure/repositories';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface MinistryInvitationTestHarnessOptions {
  db: AnyDrizzleDb;
}

interface BuildNotifierInput {
  emailSender: EmailSender;
  config?: AppConfig;
  /** Replaces the inbox sink's repository, e.g. to inject a failure. */
  inboxRepository?: NotificationRepository;
}

/**
 * Wires the real Drizzle repositories, authority manager and minting manager
 * used by every Ministry Invitation / outbox integration test — extracted so
 * new suites in this area (the outbox worker's tests, next) don't repeat it.
 */
export function createMinistryInvitationTestHarness({
  db,
}: MinistryInvitationTestHarnessOptions) {
  const ministryInvitationRepository = new DrizzleMinistryInvitationRepository({
    db,
    config: appConfig,
  });
  const roleRepository = new DrizzleRoleRepository({ db });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const churchRepository = new DrizzleChurchRepository({ db });
  const outboxRepository = new DrizzleOutboxRepository({ db });
  const volunteerRepository = new DrizzleVolunteerRepository({ db });
  const volunteerTransferRepository = new DrizzleVolunteerTransferRepository({
    db,
  });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
    eventRepository: new DrizzleEventRepository({ db }),
    eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
    ministryRepository: ministryRepository,
  });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const notificationRepository = new DrizzleNotificationRepository({ db });
  const notifications = new ChurchNotifications({ outboxRepository });
  const schedulingFacts = new SchedulingNotificationFacts({
    churchRepository,
    ministryRepository,
    cycleRepository: new DrizzleCycleRepository({ db }),
    participationRepository: new DrizzleMinistryParticipationRepository({ db }),
    eventRepository: new DrizzlePlanningEventRepository({ db }),
    eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
    assignmentRepository: new DrizzleAssignmentRepository({ db }),
    roleRepository,
    volunteerRepository,
  });
  const manager = new DbMinistryInvitationManager({
    repo: ministryInvitationRepository,
    roleRepository,
    ministryRepository,
    authorityManager,
    unitOfWork,
    outboxRepository,
    notifications,
    config: appConfig,
  });

  /** The registered email + inbox sinks over these repositories. */
  function buildNotifier({
    emailSender,
    config = appConfig,
    inboxRepository = notificationRepository,
  }: BuildNotifierInput): ChurchNotifier {
    return buildChurchNotifier({
      config,
      churchRepository,
      notificationRepository: inboxRepository,
      outboxRepository,
      emailSender,
      unitOfWork,
    });
  }

  return {
    ministryInvitationRepository,
    roleRepository,
    ministryRepository,
    churchRepository,
    outboxRepository,
    volunteerRepository,
    volunteerTransferRepository,
    authorityManager,
    unitOfWork,
    notificationRepository,
    notifications,
    schedulingFacts,
    buildNotifier,
    manager,
  };
}
