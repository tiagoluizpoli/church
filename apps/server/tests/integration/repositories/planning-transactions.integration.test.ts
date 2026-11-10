import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
import { ChurchId } from '@/domain/branded-ids';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

function createManagers() {
  const cycleRepository = new DrizzleCycleRepository({
    db: schedulingTestDb,
  });
  const eventRepository = new DrizzlePlanningEventRepository({
    db: schedulingTestDb,
  });
  const templateRepository = new DrizzleEventTemplateRepository({
    db: schedulingTestDb,
  });
  const churchRepository = new DrizzleChurchRepository({
    db: schedulingTestDb,
  });
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db: schedulingTestDb,
  });
  const shiftRepository = new DrizzleShiftRepository({ db: schedulingTestDb });
  const usualSetupRepository = new DrizzleUsualSetupRepository({
    db: schedulingTestDb,
  });
  const ministryRepository = new DrizzleMinistryRepository({
    db: schedulingTestDb,
  });
  const eventTimeBlockRepository = new DrizzleEventTimeBlockRepository({
    db: schedulingTestDb,
  });

  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });

  return {
    cycleManager: new DbCycleManager({
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      staffingSeeder,
      volunteerRepository: new DrizzleVolunteerRepository({
        db: schedulingTestDb,
      }),
      notifications: new ChurchNotifications({
        outboxRepository: new DrizzleOutboxRepository({ db: schedulingTestDb }),
      }),
    }),
    eventManager: new DbPlanningEventManager({
      cycleRepository,
      eventRepository,
      templateRepository,
      churchRepository,
      unitOfWork,
      eventTimeBlockRepository,
      assignmentRepository: new DrizzleAssignmentRepository({
        db: schedulingTestDb,
      }),
      auditRepository: new DrizzleAssignmentAuditRepository({
        db: schedulingTestDb,
      }),
      swapRequestRepository: new DrizzleSwapRequestRepository({
        db: schedulingTestDb,
      }),
      recipients: new ChurchRecipients({
        churchRepository,
        volunteerRepository: new DrizzleVolunteerRepository({
          db: schedulingTestDb,
        }),
      }),
      notifications: new ChurchNotifications({
        outboxRepository: new DrizzleOutboxRepository({ db: schedulingTestDb }),
      }),
    }),
    templateManager: new DbEventTemplateManager({
      templateRepository,
      unitOfWork,
    }),
    eventTimeBlockRepository,
  };
}

describe('Planning transaction guarantees', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('allows exactly one concurrent overlapping cycle create to succeed', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const results = await Promise.allSettled([
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Concurrent A',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Concurrent B',
        startDate: new Date('2026-11-15T00:00:00.000Z'),
        endDate: new Date('2026-12-15T00:00:00.000Z'),
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});
