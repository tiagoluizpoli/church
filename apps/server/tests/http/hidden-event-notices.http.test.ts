import { type AppConfig, appConfig } from '@church/app-config';
import { event } from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { NotificationController } from '@/api/controllers/notification-controller';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbNotificationManager } from '@/application/db-notification-manager';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import {
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
  UserId,
} from '@/domain/branded-ids';
import {
  DrizzleCycleRepository,
  DrizzleEventTemplateRepository,
  DrizzleEventTimeBlockRepository,
  DrizzlePlanningEventRepository,
} from '@/infrastructure/repositories';
import { DrizzleTemplatePrecedenceRepository } from '@/infrastructure/repositories/drizzle-template-precedence.repository';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { OtelTracing } from '@/infrastructure/services/otel-tracing';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { buildDrizzleAssignmentLifecycle } from '@/tests/test-support/assignment-lifecycle';
import {
  at,
  CHURCH_OCTOBER_1_NOON,
  seedSentSunday,
} from '@/tests/test-support/cancellation-fixture';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const db = schedulingTestDb;
const harness = createMinistryInvitationTestHarness({ db });
const { churchRepository, unitOfWork, notificationRepository } = harness;

const planningEventManager = new DbPlanningEventManager({
  cycleRepository: new DrizzleCycleRepository({ db }),
  eventRepository: new DrizzlePlanningEventRepository({ db }),
  precedenceRepository: new DrizzleTemplatePrecedenceRepository({ db }),
  templateRepository: new DrizzleEventTemplateRepository({ db }),
  churchRepository,
  unitOfWork,
  eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
  assignmentLifecycle: buildDrizzleAssignmentLifecycle({ db })
    .assignmentLifecycle,
  recipients: new ChurchRecipients({
    churchRepository,
    volunteerRepository: harness.volunteerRepository,
  }),
  notifications: harness.notifications,
});

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new NotificationController({
    notificationManager: new DbNotificationManager({
      notificationRepository,
      defaultPageSize: appConfig.notifications.pageSize,
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: actorRepository as never,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: {} as never,
      }),
    }),
    maxPageSize: appConfig.notifications.pageSize,
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
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: CHURCH_OCTOBER_1_NOON }) });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  resetClock();
});

const TITLE = 'Secret Vigil';

/** The cancellation board, with Bia able to hold a bell (a Church Member). */
async function seedSunday() {
  const sunday = await seedSentSunday();
  // The fixture's title is also the weekday name the anonymised wording uses.
  await db.update(event).set({ title: TITLE });
  await buildChurchMembership({
    db,
    churchId: sunday.churchId,
    userId: sunday.bia.userId,
    accessLevel: 'member',
  });
  return sunday;
}

type Sunday = Awaited<ReturnType<typeof seedSunday>>;
type Scope = 'event' | 'block';
type EmailLocale = 'en' | 'pt-BR';

interface CancelInput {
  sunday: Sunday;
  scope: Scope;
  hidden?: boolean;
}

/** Cancels Sunday (09:00–12:00) or its Service block (10:00–12:00). */
async function cancel({ sunday, scope, hidden }: CancelInput) {
  await planningEventManager.confirmCancellation({
    churchId: ChurchId.from(sunday.churchId),
    cycleId: CycleId.from(sunday.cycleId),
    eventId: EventId.from(sunday.eventId),
    scope:
      scope === 'event'
        ? { kind: 'event' }
        : {
            kind: 'event_time_block',
            eventTimeBlockId: EventTimeBlockId.from(sunday.serviceId),
          },
    actingUserId: UserId.from(sunday.seed.adminUserId),
    confirmation: 'cancel',
    locale: 'en',
    hidden,
  });
}

/** Drains the outbox into the bell and returns the emails it sent. */
async function drain(locale: EmailLocale = 'en') {
  const config: AppConfig = {
    ...appConfig,
    defaultLocale: locale,
  };
  const emailSender = new CaptureEmailSender({ appName: 'Church' });
  const result = await new DbOutboxDrainer({
    outboxRepository: harness.outboxRepository,
    invitationRepository: harness.ministryInvitationRepository,
    churchRepository,
    ministryRepository: harness.ministryRepository,
    roleRepository: harness.roleRepository,
    volunteerTransferRepository: harness.volunteerTransferRepository,
    emailSender,
    notifier: harness.buildNotifier({ emailSender, config }),
    schedulingFacts: harness.schedulingFacts,
    unitOfWork,
    config,
    webBaseUrl: 'https://app.test',
    errorReporter: { report: () => undefined },
    tracing: new OtelTracing(),
  }).drainOnce({ limit: 10 });
  expect(result.failed).toBe(0);
  return emailSender.delivered.map(({ request }) => request);
}

interface BellInput {
  sunday: Sunday;
  userId: string;
}

/** The data of every row in that member's bell. */
async function bell({ sunday, userId }: BellInput) {
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: sunday.churchId,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId: UserId.from(userId),
    activeChurchId: ChurchId.from(sunday.churchId),
    volunteerId: null,
    churchMembership: {
      churchId: ChurchId.from(sunday.churchId),
      accessLevel: 'member',
    },
    ministryMemberships: [],
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
  });
  expect(response.statusCode).toBe(200);
  return response
    .json()
    .items.map(({ kind, data }: { kind: string; data: unknown }) => ({
      kind,
      data,
    }));
}

const SUBJECTS = {
  en: 'Cancelled: Secret Vigil · Sun 18 Oct',
  'pt-BR': 'Cancelado: Secret Vigil · dom 18 out',
};

describe('notices about a cancelled Event that is shown', () => {
  it('lists the title in the Volunteer bell (N9) and the leader bell (N10)', async () => {
    const sunday = await seedSunday();
    await cancel({ sunday, scope: 'event' });
    await drain();

    expect(await bell({ sunday, userId: sunday.bia.userId })).toMatchObject([
      {
        kind: 'event_cancelled',
        data: {
          eventId: sunday.eventId,
          eventTitle: TITLE,
          start: at('09:00'),
          shifts: [{ eventTitle: TITLE, roleName: 'Usher' }],
        },
      },
    ]);
    expect(
      await bell({ sunday, userId: sunday.seed.adminUserId }),
    ).toMatchObject([
      {
        kind: 'event_changed',
        data: { eventTitle: TITLE, change: { kind: 'cancel' } },
      },
    ]);
  });

  it.each([
    'en',
    'pt-BR',
  ] as const)('names the title in the N9 and N10 emails (%s)', async (locale) => {
    const sunday = await seedSunday();
    await cancel({ sunday, scope: 'event' });

    const emails = await drain(locale);

    expect(emails.length).toBeGreaterThan(0);
    for (const { subject } of emails) expect(subject).toBe(SUBJECTS[locale]);
  });
});
