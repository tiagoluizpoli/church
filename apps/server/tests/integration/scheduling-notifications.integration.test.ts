import { appConfig } from '@church/app-config';
import {
  availabilityCheck,
  cycle,
  member,
  ministryParticipation,
  notification,
  outboxMessage,
} from '@church/db';
import { m } from '@church/i18n/messages';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { DbAvailabilityCheckManager } from '@/application/db-availability-check-manager';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  UserId,
} from '@/domain/branded-ids';
import type { CreateNotificationInput } from '@/domain/contracts/infrastructure/notification.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import {
  DrizzleAvailabilityCheckRepository,
  DrizzleChurchRepository,
  DrizzleCycleRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleNotificationRepository,
  DrizzlePlanningEventRepository,
} from '@/infrastructure/repositories';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

const harness = createMinistryInvitationTestHarness({ db: schedulingTestDb });
const { outboxRepository, unitOfWork } = harness;
const notifications = new ChurchNotifications({ outboxRepository });

/** Inbox repository whose next `create` calls throw. */
class FlakyInboxRepository extends DrizzleNotificationRepository {
  failuresLeft = 0;

  override async create(input: CreateNotificationInput) {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('injected inbox failure');
    }
    return super.create(input);
  }
}

function buildDrainer(
  emailSender: CaptureEmailSender,
  inboxRepository?: DrizzleNotificationRepository,
): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository,
    invitationRepository: harness.ministryInvitationRepository,
    churchRepository: harness.churchRepository,
    ministryRepository: harness.ministryRepository,
    roleRepository: harness.roleRepository,
    volunteerTransferRepository: harness.volunteerTransferRepository,
    emailSender,
    notifier: harness.buildNotifier({ emailSender, inboxRepository }),
    schedulingFacts: harness.schedulingFacts,
    unitOfWork,
    config: appConfig,
    webBaseUrl: 'https://app.test',
  });
}

interface BuildAvailabilityManagerInput {
  unitOfWork?: UnitOfWork;
}

function buildAvailabilityManager({
  unitOfWork: uow = unitOfWork,
}: BuildAvailabilityManagerInput = {}): DbAvailabilityCheckManager {
  return new DbAvailabilityCheckManager({
    participationRepository: new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }),
    eventRepository: new DrizzlePlanningEventRepository({
      db: schedulingTestDb,
    }),
    availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }),
    cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
    ministryRepository: new DrizzleMinistryRepository({ db: schedulingTestDb }),
    churchRepository: new DrizzleChurchRepository({ db: schedulingTestDb }),
    notifications,
    unitOfWork: uow,
  });
}

interface SeedMemberInput {
  name: string;
  email: string;
  withChurchMembership?: boolean;
}

/** A Volunteer in the test Ministry; Church Membership unless it is withheld. */
async function seedMember({
  name,
  email,
  withChurchMembership = true,
}: SeedMemberInput) {
  const seeded = await seedVolunteerMembership({
    churchId: ids.churchId,
    ministryId: ids.ministryId,
    name,
    email,
  });
  if (withChurchMembership) {
    await buildChurchMembership({
      db: schedulingTestDb,
      churchId: ids.churchId,
      userId: seeded.volunteer.userId,
      accessLevel: 'member',
    });
  }
  return seeded;
}

const ids = { churchId: '', ministryId: '', adminUserId: '' };
let cycleId = '';
let participationId = '';
let eventId = '';
let eventTimeBlockId = '';

beforeEach(async () => {
  await resetSchedulingPhase3Db();
  const seed = await seedSchedulingPhase3Base();
  ids.churchId = seed.churchAId;
  ids.ministryId = seed.ministryAId;
  ids.adminUserId = seed.adminUserId;
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'December 2026',
    startDate: new Date('2026-12-01T00:00:00.000Z'),
    endDate: new Date('2027-01-01T00:00:00.000Z'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Christmas Vigil',
    // 02:30 UTC is 23:30 the day before in the Church Timezone (America/Sao_Paulo).
    start: new Date('2026-12-25T02:30:00.000Z'),
    end: new Date('2026-12-25T04:00:00.000Z'),
    status: 'scheduled',
  });
  cycleId = cycle.id;
  participationId = graph.participation.id;
  eventId = graph.event.id;
  eventTimeBlockId = graph.eventTimeBlock.id;
});

async function outboxRows() {
  return schedulingTestDb
    .select()
    .from(outboxMessage)
    .where(eq(outboxMessage.churchId, ids.churchId));
}

describe('scheduling Notifications through enqueue and the drainer', () => {
  async function askOneMember() {
    await seedMember({ name: 'Ana', email: 'ana@test.com' });
    await buildAvailabilityManager().askAvailability({
      churchId: ChurchId.from(ids.churchId),
      participationId: MinistryParticipationId.from(participationId),
    });
  }

  async function dropCycle() {
    await schedulingTestDb.execute('SET session_replication_role = replica');
    await schedulingTestDb.delete(cycle).where(eq(cycle.id, cycleId));
    await schedulingTestDb.execute('SET session_replication_role = DEFAULT');
  }

  async function dueNow() {
    await schedulingTestDb
      .update(outboxMessage)
      .set({ scheduledFor: new Date(0) });
  }

  it('freezes the facts at first resolution: a retry writes the inbox row after the Cycle is gone', async () => {
    await askOneMember();
    const emailSender = new CaptureEmailSender('Church');
    const inbox = new FlakyInboxRepository({ db: schedulingTestDb });
    inbox.failuresLeft = 100;
    const drainer = buildDrainer(emailSender, inbox);

    await drainer.drainOnce({ limit: 10 });
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);
    expect(emailSender.sent.length).toBeGreaterThan(0);
    const emailsBefore = emailSender.sent.length;

    await dropCycle();
    inbox.failuresLeft = 0;
    await dueNow();
    await drainer.drainOnce({ limit: 10 });

    const rows = await schedulingTestDb.select().from(notification);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.data).toMatchObject({ cycleName: 'December 2026' });
    expect(emailSender.sent).toHaveLength(emailsBefore);
    expect((await outboxRows()).every((row) => row.status === 'sent')).toBe(
      true,
    );
  });

  it('carries the Church name and a single-word first name to the email', async () => {
    await seedMember({ name: 'Ana', email: 'ana@test.com' });
    await buildAvailabilityManager().askAvailability({
      churchId: ChurchId.from(ids.churchId),
      participationId: MinistryParticipationId.from(participationId),
    });
    const emailSender = new CaptureEmailSender('Church');

    await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(emailSender.sent[0]).toMatchObject({
      recipientFirstName: expect.stringMatching(/^\S+$/),
      churchName: expect.any(String),
    });
  });

  it('settles every sink as skipped, not failed, when the Cycle is gone before first resolution', async () => {
    await askOneMember();
    await dropCycle();
    const emailSender = new CaptureEmailSender('Church');

    const result = await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(result.failed).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);
    expect(await outboxRows()).toSatisfy(
      (rows: { status: string; channelOutcomes: unknown }[]) =>
        rows.every(
          (row) =>
            row.status === 'sent' &&
            JSON.stringify(row.channelOutcomes) ===
              JSON.stringify({ email: 'skipped', inbox: 'skipped' }),
        ),
    );
  });

  it('Ask enqueues availability_opened per active member and delivers one email and one inbox entry each', async () => {
    const first = await seedMember({ name: 'Ana', email: 'ana@test.com' });
    const second = await seedMember({ name: 'Bia', email: 'bia@test.com' });

    await buildAvailabilityManager().askAvailability({
      churchId: ChurchId.from(ids.churchId),
      participationId: MinistryParticipationId.from(participationId),
    });

    const storedParticipation = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, participationId));
    expect(storedParticipation[0]?.state).toBe('availability_requested');
    const storedChecks = await schedulingTestDb
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.cycleId, cycleId));
    expect(storedChecks).toHaveLength(3);
    const queued = await outboxRows();
    expect(queued).toHaveLength(3);
    expect(queued.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        kind: 'availability_opened',
        to: { userId: first.volunteer.userId, churchId: ids.churchId },
        data: { cycleId, ministryId: ids.ministryId },
      }),
    );

    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);
    expect(await drainer.drainOnce({ limit: 10 })).toEqual({
      claimed: 3,
      sent: 3,
      failed: 0,
    });
    // A replay finds nothing left: no duplicate email or inbox row.
    expect(await drainer.drainOnce({ limit: 10 })).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
    });

    expect(emailSender.sent.map((email) => email.kind)).toEqual([
      'availability.opened',
      'availability.opened',
      'availability.opened',
    ]);
    expect(emailSender.sent.map((email) => email.to).sort()).toEqual([
      'ana@test.com',
      'bia@test.com',
      'sched-admin@test.com',
    ]);
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox.map((row) => row.userId).sort()).toEqual(
      [first.volunteer.userId, second.volunteer.userId, ids.adminUserId].sort(),
    );
    expect(inbox[0]).toMatchObject({
      kind: 'availability_opened',
      churchId: ids.churchId,
      data: {
        cycleId,
        ministryId: ids.ministryId,
        ministryName: 'Scheduling Ministry A',
        cycleName: 'December 2026',
      },
    });
  });

  it('rolls the Notification rows back with the change', async () => {
    await seedMember({ name: 'Ana', email: 'ana@test.com' });
    const failingUnitOfWork = {
      run: (fn: Parameters<typeof unitOfWork.run>[0]) =>
        unitOfWork.run(async (tx) => {
          await fn(tx);
          throw new Error('boom');
        }),
    } as unknown as UnitOfWork;

    await expect(
      buildAvailabilityManager({
        unitOfWork: failingUnitOfWork,
      }).askAvailability({
        churchId: ChurchId.from(ids.churchId),
        participationId: MinistryParticipationId.from(participationId),
      }),
    ).rejects.toThrow('boom');

    expect(await outboxRows()).toHaveLength(0);
    const storedParticipation = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, participationId));
    expect(storedParticipation[0]?.state).toBe('preparing');
    const storedChecks = await schedulingTestDb
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.cycleId, cycleId));
    expect(storedChecks).toHaveLength(0);
  });

  it('Remind enqueues availability_reminder for the still-pending members', async () => {
    await seedMember({ name: 'Ana', email: 'ana@test.com' });
    const manager = buildAvailabilityManager();
    const churchId = ChurchId.from(ids.churchId);
    const participation = MinistryParticipationId.from(participationId);
    await manager.askAvailability({ churchId, participationId: participation });
    await schedulingTestDb.delete(outboxMessage);

    await manager.resendReminder({ churchId, participationId: participation });

    const queued = await outboxRows();
    expect(queued).toHaveLength(2);
    expect(queued.every((row) => row.kind === 'notification')).toBe(true);

    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });
    expect(emailSender.sent.map((email) => email.kind)).toEqual([
      'availability.reminder',
      'availability.reminder',
    ]);
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox.map((row) => row.kind)).toEqual([
      'availability_reminder',
      'availability_reminder',
    ]);
  });

  it('publication notifies assigned Volunteers only, once each, with their own Shifts in the Church Timezone', async () => {
    const assigned = await seedMember({ name: 'Ana', email: 'ana@test.com' });
    await seedMember({ name: 'Unassigned', email: 'none@test.com' });
    const role = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Host',
    });
    // Two Shifts for one Volunteer still make a single Notification.
    for (const [index, startTime] of [
      new Date('2026-12-25T02:30:00.000Z'),
      new Date('2026-12-25T03:15:00.000Z'),
    ].entries()) {
      const shift = await seedShift({
        churchId: ids.churchId,
        participationId,
        eventTimeBlockId,
        startTime,
        endTime: new Date(startTime.getTime() + 45 * 60 * 1000),
        label: `Shift ${index}`,
      });
      const requirement = await seedRequirement({
        churchId: ids.churchId,
        participationId,
        shiftId: shift.id,
        roleId: role.id,
        peopleNeeded: 1,
      });
      await buildAssignment({
        db: schedulingTestDb,
        churchId: ids.churchId,
        participationId,
        shiftId: shift.id,
        shiftRequirementId: requirement.id,
        volunteerId: assigned.volunteer.id,
        roleId: role.id,
        status: 'pending',
      });
    }
    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'assigning' WHERE id = '${participationId}'`,
    );

    const managers = createSchedulingManagers({ notifications });
    await managers.participationManager.publishCycle({
      churchId: ChurchId.from(ids.churchId),
      cycleId: CycleId.from(cycleId),
      ministryId: MinistryId.from(ids.ministryId),
      userId: UserId.from(ids.adminUserId),
      confirmBelowFull: true,
    });

    const queued = await outboxRows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toMatchObject({
      kind: 'schedule_published',
      to: { userId: assigned.volunteer.userId, churchId: ids.churchId },
      data: { participationId },
    });

    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      kind: 'schedule.published',
      to: 'ana@test.com',
      eventTitle: 'Christmas Vigil',
      churchTimezone: 'America/Sao_Paulo',
      shifts: [{ roleName: 'Host' }, { roleName: 'Host' }],
    });
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      userId: assigned.volunteer.userId,
      kind: 'schedule_published',
      data: {
        eventId,
        cycleId,
        ministryId: ids.ministryId,
        ministryName: 'Scheduling Ministry A',
        eventTitle: 'Christmas Vigil',
        churchTimezone: 'America/Sao_Paulo',
      },
    });
  });

  it('a Volunteer without Church Membership receives nothing on either channel', async () => {
    const outsider = await seedMember({
      name: 'Gone',
      email: 'gone@test.com',
      withChurchMembership: false,
    });

    await buildAvailabilityManager().askAvailability({
      churchId: ChurchId.from(ids.churchId),
      participationId: MinistryParticipationId.from(participationId),
    });

    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(emailSender.sent.map((email) => email.to)).toEqual([
      'sched-admin@test.com',
    ]);
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox.map((row) => row.userId)).not.toContain(
      outsider.volunteer.userId,
    );
  });
});

describe('N2 cycle_ready_to_prepare through the outbox', () => {
  const pt = { locale: 'pt-BR' } as const;

  interface EnqueueReadyInput {
    userId: string;
    ministryIds: string[];
  }

  function enqueueReady({ userId, ministryIds }: EnqueueReadyInput) {
    return unitOfWork.run((tx) =>
      notifications.enqueue({
        tx,
        kind: 'cycle_ready_to_prepare',
        to: [
          {
            userId: UserId.from(userId),
            churchId: ChurchId.from(ids.churchId),
          },
        ],
        data: { cycleId, ministryIds },
      }),
    );
  }

  async function seedKids() {
    return buildMinistry({
      db: schedulingTestDb,
      churchId: ids.churchId,
      name: 'Kids <b>& Co</b>',
    });
  }

  it('delivers one pt-BR email and one bell row listing both led Ministries, linking to the Cycle-preserving picker', async () => {
    const kids = await seedKids();
    await enqueueReady({
      userId: ids.adminUserId,
      ministryIds: [ids.ministryId, kids.id],
    });
    const emailSender = new CaptureEmailSender('Church');

    const result = await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(result.failed).toBe(0);
    expect(emailSender.delivered).toHaveLength(1);
    const [email] = emailSender.delivered;
    const text = email?.request.text ?? '';
    const html = email?.request.html ?? '';
    const pickerUrl = `https://app.test/schedules?cycleId=${cycleId}&ministryIds=${kids.id},${ids.ministryId}`;
    expect(email?.request.to).toBe('sched-admin@test.com');
    expect(email?.request.subject).toBe(
      m.notification_cycle_ready_to_prepare_title(
        { cycleName: 'December 2026' },
        pt,
      ),
    );
    expect(email?.request.from).toContain('Scheduling Church A');
    expect(text).toContain(
      m.email_greeting_notification({ firstName: 'Scheduling' }, pt),
    );
    expect(text).toContain(
      m.notification_cycle_ready_to_prepare_body(
        {
          cycleName: 'December 2026',
          startDate: '01/12/2026',
          endDate: '01/01/2027',
          events: m.notification_cycle_ready_to_prepare_events_one({}, pt),
        },
        pt,
      ),
    );
    expect(text).toContain(
      m.notification_cycle_ready_to_prepare_ministries_other(
        { ministryNames: 'Kids <b>& Co</b>, Scheduling Ministry A' },
        pt,
      ),
    );
    expect(text).toContain(
      m.notification_cycle_ready_to_prepare_action({}, pt),
    );
    expect(text).toContain(pickerUrl);
    expect(text).toContain(
      m.email_footer_membership({ churchName: 'Scheduling Church A' }, pt),
    );
    expect(html).not.toContain('<b>&');
    expect(html).toContain('Kids &lt;b&gt;&amp; Co&lt;/b&gt;');
    expect(html).toContain(pickerUrl.replace('&', '&amp;'));

    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      userId: ids.adminUserId,
      kind: 'cycle_ready_to_prepare',
      data: {
        cycleId,
        cycleName: 'December 2026',
        cycleStartDate: '2026-12-01',
        cycleEndDate: '2027-01-01',
        eventCount: 1,
        ministries: [
          { id: kids.id, name: 'Kids <b>& Co</b>' },
          { id: ids.ministryId, name: 'Scheduling Ministry A' },
        ],
      },
    });
  });

  it('links a single-Ministry leader straight to that Schedule for the Cycle', async () => {
    await enqueueReady({
      userId: ids.adminUserId,
      ministryIds: [ids.ministryId],
    });
    const emailSender = new CaptureEmailSender('Church');

    await buildDrainer(emailSender).drainOnce({ limit: 10 });

    const text = emailSender.delivered[0]?.request.text ?? '';
    expect(text).toContain(
      m.notification_cycle_ready_to_prepare_ministries_one(
        { ministryNames: 'Scheduling Ministry A' },
        pt,
      ),
    );
    expect(text).toContain(
      `https://app.test/schedules/${ids.ministryId}/${cycleId}`,
    );
  });

  it('delivers nothing on either channel to a leader no longer in the Church at delivery', async () => {
    await enqueueReady({
      userId: ids.adminUserId,
      ministryIds: [ids.ministryId],
    });
    await schedulingTestDb
      .delete(member)
      .where(
        and(
          eq(member.userId, ids.adminUserId),
          eq(member.organizationId, ids.churchId),
        ),
      );
    const emailSender = new CaptureEmailSender('Church');

    const result = await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(result.failed).toBe(0);
    expect(emailSender.delivered).toHaveLength(0);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);
  });

  it('skips and logs a row whose frozen facts predate the Ministry list instead of rendering undefined', async () => {
    await enqueueReady({
      userId: ids.adminUserId,
      ministryIds: [ids.ministryId],
    });
    const oldFacts = {
      cycleId,
      cycleName: 'December 2026',
      cycleStartDate: '2026-12-01',
      cycleEndDate: '2027-01-01',
      churchName: 'Scheduling Church A',
      actionUrl: 'https://app.test/schedules',
    };
    for (const row of await outboxRows()) {
      await schedulingTestDb
        .update(outboxMessage)
        .set({ payload: { ...(row.payload as object), facts: oldFacts } })
        .where(eq(outboxMessage.id, row.id));
    }
    const emailSender = new CaptureEmailSender('Church');

    const result = await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(result.failed).toBe(0);
    expect(emailSender.delivered).toHaveLength(0);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        status: 'sent',
        channelOutcomes: { email: 'skipped', inbox: 'skipped' },
      }),
    ]);
  });

  it('retries only the failed sink: the bell row lands later and the email is never sent twice', async () => {
    await enqueueReady({
      userId: ids.adminUserId,
      ministryIds: [ids.ministryId],
    });
    const emailSender = new CaptureEmailSender('Church');
    const inbox = new FlakyInboxRepository({ db: schedulingTestDb });
    inbox.failuresLeft = 1;
    const drainer = buildDrainer(emailSender, inbox);

    await drainer.drainOnce({ limit: 10 });
    expect(emailSender.delivered).toHaveLength(1);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);

    await schedulingTestDb
      .update(outboxMessage)
      .set({ scheduledFor: new Date(0) });
    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.delivered).toHaveLength(1);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(1);
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        status: 'sent',
        channelOutcomes: { email: 'delivered', inbox: 'delivered' },
      }),
    ]);
  });
});
