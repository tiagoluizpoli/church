import type { vi } from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { ScheduleExportController } from '@/api/controllers/schedule-export-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbScheduleChangeReader } from '@/application/db-schedule-change-reader';
import { DbScheduleExportReader } from '@/application/db-schedule-export-reader';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import {
  DrizzleAssignmentRepository,
  DrizzleMinistryParticipationRepository,
  DrizzlePlanningEventRepository,
  DrizzleRoleRepository,
  DrizzleShiftRepository,
} from '@/infrastructure/repositories';
import { DrizzleEventGroupRepository } from '@/infrastructure/repositories/drizzle-event-group.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleScheduleExportRepository } from '@/infrastructure/repositories/drizzle-schedule-export.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { TypstCliRenderer } from '@/infrastructure/typst/typst-cli-renderer';
import {
  TYPST_BINARY,
  TYPST_FONTS_DIR,
  TYPST_TEMPLATES_DIR,
} from '@/infrastructure/typst/typst-paths';
import { createFastify } from '@/main/fastify/setup';
import { schedulingTestDb } from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

interface ScheduleExportAppInput {
  activeChurchResolver: { resolve: ReturnType<typeof vi.fn> };
}

/** The export routes over the scheduling test database, as the export suites mount them. */
export async function buildScheduleExportApp({
  activeChurchResolver,
}: ScheduleExportAppInput) {
  const db = schedulingTestDb;
  const app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new ScheduleExportController({
    scheduleExportReader: new DbScheduleExportReader({
      scheduleExportRepository: new DrizzleScheduleExportRepository({ db }),
      eventGroupRepository: new DrizzleEventGroupRepository({ db }),
      scheduleChangeReader: new DbScheduleChangeReader({
        assignmentRepository: new DrizzleAssignmentRepository({ db }),
        eventRepository: new DrizzlePlanningEventRepository({ db }),
        participationRepository: new DrizzleMinistryParticipationRepository({
          db,
        }),
        roleRepository: new DrizzleRoleRepository({ db }),
        shiftRepository: new DrizzleShiftRepository({ db }),
      }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      typstRenderer: new TypstCliRenderer({
        objectStorage: new InMemoryObjectStorage(),
        config: {
          binary: TYPST_BINARY,
          fontsDir: TYPST_FONTS_DIR,
          templatesDir: TYPST_TEMPLATES_DIR,
          timeoutMs: 10_000,
          cacheBytes: 10 * 1024 * 1024,
          concurrency: 2,
        },
      }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: new DrizzleMinistryRepository({ db }),
      }),
    }),
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
  return app;
}
