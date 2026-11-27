import { type AppConfig, appConfig } from '@church/app-config';
import { event, outboxMessage } from '@church/db';
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
import { CycleEventGenerator } from '@/domain/services/planning/cycle-event-generator';
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
  cycleEventGenerator: new CycleEventGenerator(),
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
            kind: 'eventTimeBlock',
            eventTimeBlockId: EventTimeBlockId.from(sunday.serviceId),
          },
    actingUserId: UserId.from(sunday.seed.adminUserId),
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

interface SetHiddenInput extends CancelInput {
  hidden: boolean;
}

async function setHidden({ sunday, scope, hidden }: SetHiddenInput) {
  await planningEventManager.setHidden({
    churchId: ChurchId.from(sunday.churchId),
    cycleId: CycleId.from(sunday.cycleId),
    eventId: EventId.from(sunday.eventId),
    scope:
      scope === 'event'
        ? { kind: 'event' }
        : {
            kind: 'eventTimeBlock',
            eventTimeBlockId: EventTimeBlockId.from(sunday.serviceId),
          },
    hidden,
  });
}

/** Bia's N9 line and the admin's N10, as the bell lists them. */
async function bells(sunday: Sunday) {
  const [volunteer] = await bell({ sunday, userId: sunday.bia.userId });
  const [leader] = await bell({ sunday, userId: sunday.seed.adminUserId });
  return { volunteer: volunteer.data, leader: leader.data };
}

describe('notices about a hidden cancelled Event', () => {
  it.each([
    'event',
    'block',
  ] as const)('drops the title from the bell while the %s is hidden, and brings it back', async (scope) => {
    const sunday = await seedSunday();
    await cancel({ sunday, scope });
    await drain();
    const queued = await db.select().from(outboxMessage);
    const shown = await bells(sunday);
    expect(JSON.stringify(shown)).toContain(TITLE);

    await setHidden({ sunday, scope, hidden: true });
    const hidden = await bells(sunday);

    const blockScope =
      scope === 'block' ? { eventTimeBlockId: sunday.serviceId } : {};
    expect(hidden.volunteer).toEqual({
      ...shown.volunteer,
      ...blockScope,
      eventTitle: '',
      hidden: true,
      shifts: [
        {
          eventTitle: '',
          ministryName: 'Scheduling Ministry A',
          roleName: 'Usher',
          sectorName: 'Lobby',
          startsAt: at('10:00'),
          endsAt: at('12:00'),
        },
      ],
    });
    expect(hidden.leader).toEqual({
      ...shown.leader,
      eventTitle: '',
      hidden: true,
    });
    expect(JSON.stringify(hidden)).not.toContain(TITLE);

    await setHidden({ sunday, scope, hidden: false });

    expect(await bells(sunday)).toEqual(shown);
    // Hiding and showing send nothing new.
    expect(await db.select().from(outboxMessage)).toHaveLength(queued.length);
  });

  it('drops the title from older add and move notices of the Event', async () => {
    const sunday = await seedSunday();
    const { churchId, eventId, cycleId, seed } = sunday;
    const times = { start: at('09:00'), end: at('12:00') };
    await unitOfWork.run((tx) =>
      harness.notifications.enqueue({
        tx,
        kind: 'event_changed',
        to: [
          {
            userId: UserId.from(seed.adminUserId),
            churchId: ChurchId.from(churchId),
          },
        ],
        data: {
          cycleId,
          cycleName: 'October',
          eventId,
          eventTitle: TITLE,
          adminName: 'Scheduling Admin',
          churchName: 'Scheduling Church A',
          churchTimezone: 'America/Sao_Paulo',
          ministries: [{ id: seed.ministryAId, name: 'Scheduling Ministry A' }],
          change: { kind: 'add', ...times },
        },
      }),
    );
    await drain();
    await cancel({ sunday, scope: 'event', hidden: true });

    expect(await bell({ sunday, userId: seed.adminUserId })).toMatchObject([
      { data: { eventTitle: '', hidden: true, change: { kind: 'add' } } },
    ]);
  });

  it.each([
    ['event', 'en', 'The Sunday event on 18 Oct at 09:00 was cancelled'],
    ['block', 'en', 'The Sunday 10:00 time block was cancelled'],
    ['event', 'pt-BR', 'O evento de domingo, 18 out, às 09:00, foi cancelado'],
    ['block', 'pt-BR', 'O horário de domingo às 10:00 foi cancelado'],
  ] as const)('queues titleless N9 and N10 emails for a %s cancelled hidden (%s)', async (scope, locale, title) => {
    const sunday = await seedSunday();
    await cancel({ sunday, scope, hidden: true });

    const emails = await drain(locale);

    // N9 to Bia and N10 to the admin; Ana holds no Church Membership here.
    expect(emails).toHaveLength(2);
    for (const { subject, text, html } of emails) {
      expect(subject).toBe(title);
      expect(`${text}${html}`).not.toContain(TITLE);
    }
    const day = locale === 'en' ? 'Sun 18 Oct' : 'dom 18 out';
    const line = `${day} · 10:00–12:00 · Scheduling Ministry A · Usher`;
    const [volunteerEmail] = emails.filter(({ text }) => text?.includes(line));
    expect(volunteerEmail).toBeDefined();
    expect(volunteerEmail?.text).not.toContain('Lobby');
  });
});
