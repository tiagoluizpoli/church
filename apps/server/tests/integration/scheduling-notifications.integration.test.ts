import { appConfig } from '@church/app-config';
import {
  assignment,
  availabilityAsk,
  availabilityCheck,
  cycle,
  member,
  ministryParticipation,
  notification,
  outboxMessage,
  scheduleLastTold,
  shift,
  shiftRequirement,
} from '@church/db';
import { m } from '@church/i18n/messages';
import {
  type Instant,
  parseCalendarDay,
  resetClock,
  setTestClock,
} from '@church/time';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { DbAvailabilityCheckManager } from '@/application/db-availability-check-manager';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import { ChurchId, CycleId, MinistryId, UserId } from '@/domain/branded-ids';
import type { AvailabilityEmail } from '@/domain/contracts/infrastructure/email-sender';
import type { CreateNotificationInput } from '@/domain/contracts/infrastructure/notification.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import {
  DrizzleAvailabilityCheckRepository,
  DrizzleChurchRepository,
  DrizzleCycleRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleNotificationRepository,
} from '@/infrastructure/repositories';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
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
    availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }),
    cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
    ministryRepository: new DrizzleMinistryRepository({ db: schedulingTestDb }),
    churchRepository: new DrizzleChurchRepository({ db: schedulingTestDb }),
    notifications,
    unitOfWork: uow,
    config: appConfig,
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

async function seedNeededShift(roleIds: string[]) {
  const shift = await seedShift({
    churchId: ids.churchId,
    participationId,
    eventTimeBlockId,
    startTime: new Date('2026-12-25T02:30:00.000Z'),
    endTime: new Date('2026-12-25T04:00:00.000Z'),
    label: 'Needed',
  });
  for (const roleId of roleIds) {
    await seedRequirement({
      churchId: ids.churchId,
      participationId,
      shiftId: shift.id,
      roleId,
      peopleNeeded: 1,
    });
  }
}

async function seedRoleHolder(name: string, roleId: string) {
  const seeded = await seedMember({ name, email: `${name}@test.com` });
  await seedRoleQualification({
    churchId: ids.churchId,
    membershipId: seeded.membership.id,
    roleId,
  });
  return seeded.volunteer.userId;
}

/** Asks the Schedule, a needed Role held by each named Volunteer; returns their user ids. */
async function askHolders(...names: string[]) {
  const needed = await seedRole({
    churchId: ids.churchId,
    ministryId: ids.ministryId,
    name: 'Host',
  });
  await seedNeededShift([needed.id]);
  const userIds: string[] = [];
  for (const name of names) {
    userIds.push(await seedRoleHolder(name, needed.id));
  }
  await buildAvailabilityManager().askSchedule(scheduleKey());
  return userIds;
}

const scheduleKey = () => ({
  churchId: ChurchId.from(ids.churchId),
  ministryId: MinistryId.from(ids.ministryId),
  cycleId: CycleId.from(cycleId),
});

async function outboxRows() {
  return schedulingTestDb
    .select()
    .from(outboxMessage)
    .where(eq(outboxMessage.churchId, ids.churchId));
}

describe('scheduling Notifications through enqueue and the drainer', () => {
  // Inside the December Cycle's askable window, whatever day the suite runs.
  beforeEach(() => {
    setTestClock({ instant: '2026-11-02T12:00:00.000Z' as Instant });
  });
  afterEach(() => resetClock());

  const askOneMember = () => askHolders('ana');

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
    await askOneMember();
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

  it('Ask enqueues availability_opened per needed-Role holder and delivers one email and one inbox entry each', async () => {
    const [first, second] = await askHolders('ana', 'bia');

    const storedParticipation = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, participationId));
    expect(storedParticipation[0]?.state).toBe('availability_requested');
    const storedChecks = await schedulingTestDb
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.cycleId, cycleId));
    expect(storedChecks).toHaveLength(2);
    const memberships = await new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }).listActiveMemberships(scheduleKey());
    const firstMembership = memberships.find(({ userId }) => userId === first);
    const firstCheck = storedChecks.find(
      ({ ministryMembershipId }) =>
        ministryMembershipId === firstMembership?.ministryMembershipId,
    );
    expect(firstCheck).toBeDefined();
    const queued = await outboxRows();
    expect(queued).toHaveLength(2);
    expect(queued.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        kind: 'availability_opened',
        to: { userId: first, churchId: ids.churchId },
        data: { cycleId, ministryId: ids.ministryId, checkId: firstCheck?.id },
      }),
    );

    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);
    expect(await drainer.drainOnce({ limit: 10 })).toEqual({
      claimed: 2,
      sent: 2,
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
    ]);
    expect(emailSender.sent.map((email) => email.to).sort()).toEqual([
      'ana@test.com',
      'bia@test.com',
    ]);
    for (const email of emailSender.sent) {
      const userId = email.to === 'ana@test.com' ? first : second;
      const membership = memberships.find((row) => row.userId === userId);
      const check = storedChecks.find(
        (row) => row.ministryMembershipId === membership?.ministryMembershipId,
      );
      expect(email).toMatchObject({
        actionUrl: `https://app.test/availability/${check?.id}`,
      });
      const delivered = emailSender.delivered.find(
        (row) => row.payload.to === email.to,
      );
      expect(delivered?.request.html).toContain(`/availability/${check?.id}`);
    }
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox.map((row) => row.userId).sort()).toEqual(
      [first, second].sort(),
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
    const needed = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Host',
    });
    await seedNeededShift([needed.id]);
    await seedRoleHolder('ana', needed.id);
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
      }).askSchedule(scheduleKey()),
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
    await askHolders('ana', 'bia');
    await schedulingTestDb.delete(outboxMessage);

    await buildAvailabilityManager().remindSchedule(scheduleKey());

    const queued = await outboxRows();
    expect(queued).toHaveLength(2);
    expect(queued.every((row) => row.kind === 'notification')).toBe(true);
    const checks = await schedulingTestDb.select().from(availabilityCheck);
    expect(queued.map((row) => row.payload)).toEqual(
      expect.arrayContaining(
        checks.map(({ id }) =>
          expect.objectContaining({
            data: { cycleId, ministryId: ids.ministryId, checkId: id },
          }),
        ),
      ),
    );

    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });
    expect(emailSender.sent.map((email) => email.kind)).toEqual([
      'availability.reminder',
      'availability.reminder',
    ]);
    expect(emailSender.sent).toEqual(
      expect.arrayContaining(
        checks.map(({ id }) =>
          expect.objectContaining({
            actionUrl: `https://app.test/availability/${id}`,
          }),
        ),
      ),
    );
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox.map((row) => row.kind)).toEqual([
      'availability_reminder',
      'availability_reminder',
    ]);
  });

  it('Remind deep-links a newly eligible Volunteer to the check opened by its sweep', async () => {
    await askHolders('ana');
    await schedulingTestDb.delete(outboxMessage);
    const role = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Late Role',
    });
    await seedNeededShift([role.id]);
    const userId = await seedRoleHolder('late', role.id);

    expect(
      await buildAvailabilityManager().remindSchedule(scheduleKey()),
    ).toMatchObject({
      remindedCount: 1,
      newCheckCount: 1,
    });
    const memberships = await new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }).listActiveMemberships(scheduleKey());
    const membership = memberships.find((row) => row.userId === userId);
    const checks = await schedulingTestDb.select().from(availabilityCheck);
    const check = checks.find(
      (row) => row.ministryMembershipId === membership?.ministryMembershipId,
    );
    expect(check).toBeDefined();
    expect((await outboxRows()).map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        kind: 'availability_opened',
        to: { userId, churchId: ids.churchId },
        data: { cycleId, ministryId: ids.ministryId, checkId: check?.id },
      }),
    );
    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });
    expect(
      emailSender.sent.find((email) => email.to === 'late@test.com'),
    ).toMatchObject({
      kind: 'availability.opened',
      actionUrl: `https://app.test/availability/${check?.id}`,
    });
    const inbox = await schedulingTestDb
      .select()
      .from(notification)
      .where(eq(notification.userId, userId));
    expect(inbox[0]?.data).toMatchObject({ checkId: check?.id });
  });

  it('refuses to publish a Schedule with no active Assignments', async () => {
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(eq(ministryParticipation.id, participationId));

    const managers = createSchedulingManagers({ notifications });
    await expect(
      managers.participationManager.publishCycle({
        churchId: ChurchId.from(ids.churchId),
        cycleId: CycleId.from(cycleId),
        ministryId: MinistryId.from(ids.ministryId),
        userId: UserId.from(ids.adminUserId),
        confirmBelowFull: true,
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_HAS_NO_ASSIGNMENTS' });
    expect(await outboxRows()).toHaveLength(0);
    const rows = await schedulingTestDb.select().from(ministryParticipation);
    expect(rows.find((row) => row.id === participationId)?.state).toBe(
      'assigning',
    );
  });

  it('publication notifies assigned Volunteers only, once each, with their own Shifts in the Church Timezone', async () => {
    const assigned = await seedMember({ name: 'Ana', email: 'ana@test.com' });
    const otherAssigned = await seedMember({
      name: 'Bruno',
      email: 'bruno@test.com',
    });
    const unassigned = await seedMember({
      name: 'Unassigned',
      email: 'none@test.com',
    });
    await buildAvailabilityCheck({
      db: schedulingTestDb,
      churchId: ids.churchId,
      cycleId,
      ministryMembershipId: unassigned.membership.id,
    });
    const sibling = await buildMinistry({
      db: schedulingTestDb,
      churchId: ids.churchId,
      name: 'Sibling Ministry',
    });
    const [siblingParticipation] = await schedulingTestDb
      .insert(ministryParticipation)
      .values({
        churchId: ids.churchId,
        ministryId: sibling.id,
        eventId,
        state: 'assigning',
      })
      .returning();
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
    const otherGraph = await createSchedulingPhase3EventGraph({
      churchId: ids.churchId,
      cycleId,
      ministryId: ids.ministryId,
      title: 'Christmas Morning',
      start: new Date('2026-12-26T10:00:00.000Z'),
      end: new Date('2026-12-26T12:00:00.000Z'),
      status: 'scheduled',
    });
    const otherShift = await seedShift({
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      eventTimeBlockId: otherGraph.eventTimeBlock.id,
      label: 'Morning',
      startTime: new Date('2026-12-26T10:00:00.000Z'),
      endTime: new Date('2026-12-26T11:00:00.000Z'),
    });
    const otherRequirement = await seedRequirement({
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      shiftId: otherShift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    await buildAssignment({
      db: schedulingTestDb,
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      shiftId: otherShift.id,
      shiftRequirementId: otherRequirement.id,
      volunteerId: assigned.volunteer.id,
      roleId: role.id,
      status: 'pending',
    });
    await buildAssignment({
      db: schedulingTestDb,
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      shiftId: otherShift.id,
      shiftRequirementId: otherRequirement.id,
      volunteerId: otherAssigned.volunteer.id,
      roleId: role.id,
      status: 'pending',
    });
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(eq(ministryParticipation.id, otherGraph.participation.id));
    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'assigning' WHERE id = '${participationId}'`,
    );

    const managers = createSchedulingManagers({ notifications });
    const publishInput = {
      churchId: ChurchId.from(ids.churchId),
      cycleId: CycleId.from(cycleId),
      ministryId: MinistryId.from(ids.ministryId),
      userId: UserId.from(ids.adminUserId),
      confirmBelowFull: true,
    };
    const concurrent = await Promise.allSettled([
      managers.participationManager.publishCycle(publishInput),
      managers.participationManager.publishCycle(publishInput),
    ]);
    expect(
      concurrent.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrent.filter((result) => result.status === 'rejected'),
    ).toMatchObject([{ reason: { code: 'SCHEDULE_ALREADY_PUBLISHED' } }]);

    await expect(
      managers.participationManager.publishCycle({
        churchId: ChurchId.from(ids.churchId),
        cycleId: CycleId.from(cycleId),
        ministryId: MinistryId.from(ids.ministryId),
        userId: UserId.from(ids.adminUserId),
        confirmBelowFull: true,
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_ALREADY_PUBLISHED' });
    const states = await schedulingTestDb.select().from(ministryParticipation);
    expect(states.find((row) => row.id === participationId)?.state).toBe(
      'published',
    );
    expect(
      states.find((row) => row.id === siblingParticipation?.id)?.state,
    ).toBe('assigning');
    expect(
      states.find((row) => row.id === otherGraph.participation.id)?.state,
    ).toBe('published');
    const queued = await outboxRows();
    expect(queued).toHaveLength(2);
    expect(queued.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        kind: 'schedule_published',
        to: { userId: assigned.volunteer.userId, churchId: ids.churchId },
        data: expect.objectContaining({
          cycleId,
          ministryId: ids.ministryId,
          shifts: expect.arrayContaining([
            expect.objectContaining({ eventTitle: 'Christmas Vigil' }),
            expect.objectContaining({ eventTitle: 'Christmas Morning' }),
          ]),
        }),
      }),
    );
    expect(queued.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        to: { userId: otherAssigned.volunteer.userId, churchId: ids.churchId },
        data: expect.objectContaining({
          shifts: [
            expect.objectContaining({ eventTitle: 'Christmas Morning' }),
          ],
        }),
      }),
    );

    const snapshots = await schedulingTestDb.select().from(scheduleLastTold);
    expect(snapshots).toHaveLength(2);
    const anaSnapshot = snapshots.find(
      (row) => row.volunteerId === assigned.volunteer.id,
    );
    expect(anaSnapshot).toMatchObject({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      cycleId,
      volunteerId: assigned.volunteer.id,
    });
    expect(anaSnapshot?.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId,
          eventTitle: 'Christmas Vigil',
          roleName: 'Host',
          sectorName: 'Geral',
        }),
        expect.objectContaining({
          eventId: otherGraph.event.id,
          eventTitle: 'Christmas Morning',
          roleName: 'Host',
          sectorName: 'Geral',
        }),
      ]),
    );
    expect(Array.isArray(anaSnapshot?.assignments)).toBe(true);
    if (!Array.isArray(anaSnapshot?.assignments))
      throw new Error('missing snapshot');
    for (const snapshot of anaSnapshot.assignments) {
      expect(snapshot).not.toHaveProperty('swapRequestCovered', true);
    }
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    await schedulingTestDb
      .update(shiftRequirement)
      .set({ peopleNeeded: 2 })
      .where(eq(shiftRequirement.id, otherRequirement.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    const destination = await seedShift({
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      eventTimeBlockId: otherGraph.eventTimeBlock.id,
      label: 'Later',
      startTime: new Date('2026-12-26T11:00:00.000Z'),
      endTime: new Date('2026-12-26T12:00:00.000Z'),
    });
    const destinationRequirement = await seedRequirement({
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      shiftId: destination.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const [original] = await schedulingTestDb
      .select()
      .from(assignment)
      .where(
        and(
          eq(assignment.volunteerId, assigned.volunteer.id),
          eq(assignment.participationId, participationId),
        ),
      );
    if (!original) throw new Error('missing Assignment');
    const sideSector = await buildSector({
      db: schedulingTestDb,
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Side',
    });
    const sideRequirement = await seedRequirement({
      churchId: ids.churchId,
      participationId,
      shiftId: original.shiftId,
      roleId: role.id,
      sectorId: sideSector.id,
      peopleNeeded: 1,
    });
    await schedulingTestDb
      .update(assignment)
      .set({ shiftRequirementId: sideRequirement.id })
      .where(eq(assignment.id, original.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(1);
    await schedulingTestDb
      .update(assignment)
      .set({ shiftRequirementId: original.shiftRequirementId })
      .where(eq(assignment.id, original.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    await schedulingTestDb
      .update(assignment)
      .set({
        participationId: otherGraph.participation.id,
        shiftId: destination.id,
        shiftRequirementId: destinationRequirement.id,
      })
      .where(eq(assignment.id, original.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(1);
    await schedulingTestDb
      .update(assignment)
      .set({
        participationId: original.participationId,
        shiftId: original.shiftId,
        shiftRequirementId: original.shiftRequirementId,
      })
      .where(eq(assignment.id, original.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    const lateAssignment = await buildAssignment({
      db: schedulingTestDb,
      churchId: ids.churchId,
      participationId: otherGraph.participation.id,
      shiftId: otherShift.id,
      shiftRequirementId: otherRequirement.id,
      volunteerId: unassigned.volunteer.id,
      roleId: role.id,
      status: 'pending',
    });
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(1);
    await schedulingTestDb
      .update(assignment)
      .set({ status: 'cancelled' })
      .where(eq(assignment.id, lateAssignment.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    await schedulingTestDb
      .update(shift)
      .set({ endTime: new Date('2026-12-26T11:30:00.000Z') })
      .where(eq(shift.id, otherShift.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(2);
    await schedulingTestDb
      .update(shift)
      .set({ endTime: new Date('2026-12-26T11:00:00.000Z') })
      .where(eq(shift.id, otherShift.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    // Later Assignment changes must not alter what publish communicates.
    await schedulingTestDb
      .update(assignment)
      .set({ status: 'cancelled' })
      .where(eq(assignment.volunteerId, assigned.volunteer.id));

    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(1);
    expect(
      (
        await managers.participationManager.listSchedules({
          churchId: publishInput.churchId,
        })
      ).find(
        (schedule) =>
          schedule.ministry.id === publishInput.ministryId &&
          schedule.cycle.id === publishInput.cycleId,
      )?.affectedVolunteerCount,
    ).toBe(1);

    setTestClock({ instant: '2026-12-27T12:00:00.000Z' as Instant });
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    setTestClock({ instant: '2026-11-02T12:00:00.000Z' as Instant });
    await schedulingTestDb
      .update(assignment)
      .set({ status: 'pending' })
      .where(eq(assignment.volunteerId, assigned.volunteer.id));
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);
    await schedulingTestDb
      .update(assignment)
      .set({ status: 'cancelled' })
      .where(eq(assignment.volunteerId, assigned.volunteer.id));

    await schedulingTestDb
      .update(assignment)
      .set({ status: 'pending' })
      .where(eq(assignment.id, lateAssignment.id));
    setTestClock({ instant: '2026-12-26T09:00:00.000Z' as Instant });
    const snapshotsBefore = await schedulingTestDb
      .select()
      .from(scheduleLastTold);
    const rowsBefore = await outboxRows();
    const failingEnqueue = vi
      .spyOn(notifications, 'enqueue')
      .mockRejectedValueOnce(new Error('send enqueue failed'));
    await expect(
      managers.participationManager.sendScheduleUpdates(publishInput),
    ).rejects.toThrow('send enqueue failed');
    failingEnqueue.mockRestore();
    expect(await schedulingTestDb.select().from(scheduleLastTold)).toEqual(
      snapshotsBefore,
    );
    expect(await outboxRows()).toEqual(rowsBefore);
    const updates = await Promise.allSettled([
      managers.participationManager.sendScheduleUpdates(publishInput),
      managers.participationManager.sendScheduleUpdates(publishInput),
    ]);
    expect(
      updates.filter((result) => result.status === 'fulfilled'),
    ).toMatchObject([{ value: { notifiedCount: 2 } }]);
    expect(
      updates.filter((result) => result.status === 'rejected'),
    ).toMatchObject([{ reason: { code: 'NO_UNSENT_CHANGES' } }]);
    const updateRows = (await outboxRows()).filter(
      (row) =>
        typeof row.payload === 'object' &&
        row.payload !== null &&
        'kind' in row.payload &&
        row.payload.kind === 'schedule_updated',
    );
    expect(updateRows).toHaveLength(2);
    expect(updateRows.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        to: { userId: assigned.volunteer.userId, churchId: ids.churchId },
        data: expect.objectContaining({
          changes: [
            expect.objectContaining({
              kind: 'removed',
              assignment: expect.objectContaining({
                eventTitle: 'Christmas Morning',
              }),
            }),
          ],
        }),
      }),
    );
    expect(updateRows.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        to: { userId: unassigned.volunteer.userId, churchId: ids.churchId },
        data: expect.objectContaining({
          changes: [
            expect.objectContaining({
              kind: 'added',
              assignment: expect.objectContaining({
                eventTitle: 'Christmas Morning',
              }),
            }),
          ],
        }),
      }),
    );
    setTestClock({ instant: '2026-11-02T12:00:00.000Z' as Instant });
    expect(
      (await managers.participationManager.getCycleBuilderData(publishInput))
        .affectedVolunteerCount,
    ).toBe(0);

    setTestClock({ instant: '2026-12-26T09:00:00.000Z' as Instant });
    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });
    expect(emailSender.sent).toHaveLength(4);
    expect(
      emailSender.sent.find(
        (email) =>
          email.to === 'ana@test.com' && email.kind === 'schedule.published',
      ),
    ).toMatchObject({
      kind: 'schedule.published',
      to: 'ana@test.com',
      churchTimezone: 'America/Sao_Paulo',
      actionUrl: 'https://app.test/my-schedule',
      shifts: [
        expect.objectContaining({ roleName: 'Host' }),
        expect.objectContaining({ roleName: 'Host' }),
        expect.objectContaining({ roleName: 'Host' }),
      ],
    });
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox).toHaveLength(4);
    expect(
      inbox.find(
        (row) =>
          row.userId === assigned.volunteer.userId &&
          row.kind === 'schedule_published',
      ),
    ).toMatchObject({
      userId: assigned.volunteer.userId,
      kind: 'schedule_published',
      data: {
        cycleId,
        ministryId: ids.ministryId,
        ministryName: 'Scheduling Ministry A',
        churchTimezone: 'America/Sao_Paulo',
      },
    });
  });

  it.each([
    'schedule_published',
    'schedule_updated',
  ])('skips legacy %s outbox rows rather than reconstructing mutable facts', async (kind) => {
    const member = await seedMember({
      name: 'Legacy',
      email: 'legacy@test.com',
    });
    await schedulingTestDb.insert(outboxMessage).values({
      churchId: ids.churchId,
      kind: 'notification',
      correlationId: 'legacy-n5',
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
      payload: {
        kind,
        to: { churchId: ids.churchId, userId: member.volunteer.userId },
        data: { participationId },
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sender = new CaptureEmailSender('Church');
    const result = await buildDrainer(sender).drainOnce({ limit: 10 });
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(sender.sent).toHaveLength(0);
    expect(await schedulingTestDb.select().from(notification)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('frozen facts predate a required field'),
    );
    warn.mockRestore();
  });

  it('rolls back publication and snapshots when notification enqueue fails', async () => {
    const assigned = await seedMember({
      name: 'Ana',
      email: 'rollback@test.com',
    });
    const role = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Host',
    });
    const shift = await seedShift({
      churchId: ids.churchId,
      participationId,
      eventTimeBlockId,
      label: 'Evening',
      startTime: new Date('2026-12-25T02:30:00.000Z'),
      endTime: new Date('2026-12-25T03:15:00.000Z'),
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
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(eq(ministryParticipation.id, participationId));
    const enqueue = vi
      .spyOn(notifications, 'enqueue')
      .mockRejectedValueOnce(new Error('enqueue failed'));
    const managers = createSchedulingManagers({ notifications });
    await expect(
      managers.participationManager.publishCycle({
        churchId: ChurchId.from(ids.churchId),
        cycleId: CycleId.from(cycleId),
        ministryId: MinistryId.from(ids.ministryId),
        userId: UserId.from(ids.adminUserId),
        confirmBelowFull: true,
      }),
    ).rejects.toThrow('enqueue failed');
    enqueue.mockRestore();
    expect(await schedulingTestDb.select().from(scheduleLastTold)).toHaveLength(
      0,
    );
    expect(await outboxRows()).toHaveLength(0);
    const rows = await schedulingTestDb.select().from(ministryParticipation);
    expect(rows.find((row) => row.id === participationId)?.state).toBe(
      'assigning',
    );
  });

  it('a Volunteer without Church Membership receives nothing on either channel', async () => {
    const needed = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Host',
    });
    await seedNeededShift([needed.id]);
    await seedRoleHolder('ana', needed.id);
    const outsider = await seedMember({
      name: 'Gone',
      email: 'gone@test.com',
      withChurchMembership: false,
    });
    await seedRoleQualification({
      churchId: ids.churchId,
      membershipId: outsider.membership.id,
      roleId: needed.id,
    });

    await buildAvailabilityManager().askSchedule(scheduleKey());

    const emailSender = new CaptureEmailSender('Church');
    await buildDrainer(emailSender).drainOnce({ limit: 10 });

    expect(emailSender.sent.map((email) => email.to)).toEqual(['ana@test.com']);
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

describe('availability delivery facts resolved per recipient', () => {
  const scope = () => ({ cycleId, ministryId: ids.ministryId });
  const recipient = (userId: string) => ({
    churchId: ChurchId.from(ids.churchId),
    userId: UserId.from(userId),
  });

  afterEach(() => resetClock());

  async function seedAsk(answerBy: string | null) {
    await schedulingTestDb.insert(availabilityAsk).values({
      churchId: ids.churchId,
      ...scope(),
      askedAt: new Date('2026-11-01T12:00:00.000Z'),
      answerBy,
    });
  }

  async function enqueue(
    kind: 'availability_opened' | 'availability_reminder',
    userId: string,
  ) {
    await unitOfWork.run((tx) =>
      notifications.enqueue({
        tx,
        kind,
        to: [recipient(userId)],
        data: scope(),
      }),
    );
  }

  it('counts each Volunteer the Shifts needing a Role they hold, in email and bell', async () => {
    const guitar = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Guitar',
    });
    const vocal = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Vocal',
    });
    await seedNeededShift([guitar.id, vocal.id]);
    await seedNeededShift([guitar.id]);
    await seedNeededShift([guitar.id]);
    const guitarist = await seedRoleHolder('ana', guitar.id);
    const singer = await seedRoleHolder('bia', vocal.id);
    await seedAsk(null);
    await enqueue('availability_opened', guitarist);
    await enqueue('availability_opened', singer);
    const emailSender = new CaptureEmailSender('Church');

    await buildDrainer(emailSender).drainOnce({ limit: 10 });

    const counts = Object.fromEntries(
      emailSender.sent.map((email) => [
        email.to,
        (email as AvailabilityEmail).shiftCount,
      ]),
    );
    expect(counts).toEqual({ 'ana@test.com': 3, 'bia@test.com': 1 });
    const inbox = await schedulingTestDb.select().from(notification);
    const bell = Object.fromEntries(
      inbox.map((row) => [
        row.userId,
        (row.data as { shiftCount?: number }).shiftCount,
      ]),
    );
    expect(bell).toEqual({ [guitarist]: 3, [singer]: 1 });
  });

  it('carries a moved Deadline in the next Remind while delivered rows keep their frozen one', async () => {
    const guitar = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Guitar',
    });
    await seedNeededShift([guitar.id]);
    const userId = await seedRoleHolder('ana', guitar.id);
    await seedAsk('2999-01-10');
    await enqueue('availability_opened', userId);
    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);
    await drainer.drainOnce({ limit: 10 });

    await schedulingTestDb
      .update(availabilityAsk)
      .set({ answerBy: '2999-02-20' })
      .where(eq(availabilityAsk.cycleId, cycleId));
    await enqueue('availability_reminder', userId);
    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.sent).toMatchObject([
      { kind: 'availability.opened', answerBy: '2999-01-10' },
      { kind: 'availability.reminder', answerBy: '2999-02-20' },
    ]);
    const inbox = await schedulingTestDb.select().from(notification);
    const opened = inbox.find((row) => row.kind === 'availability_opened');
    const reminded = inbox.find((row) => row.kind === 'availability_reminder');
    expect(opened?.data).toMatchObject({ answerBy: '2999-01-10' });
    expect(reminded?.data).toMatchObject({ answerBy: '2999-02-20' });
  });

  it('a real Remind carries the moved Deadline to the not-confirmed and Answer by to the newly eligible, even past it', async () => {
    const guitar = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Guitar',
    });
    await seedNeededShift([guitar.id]);
    await seedRoleHolder('ana', guitar.id);
    const manager = buildAvailabilityManager();
    setTestClock({ instant: '2026-11-02T12:00:00.000Z' as Instant });
    await manager.askSchedule({
      ...scheduleKey(),
      answerBy: parseCalendarDay({ value: '2026-11-10' }),
    });
    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);
    await drainer.drainOnce({ limit: 10 });
    await manager.setDeadline({
      ...scheduleKey(),
      answerBy: parseCalendarDay({ value: '2026-11-20' }),
    });
    await seedRoleHolder('bia', guitar.id);

    setTestClock({ instant: '2026-11-25T12:00:00.000Z' as Instant });
    await manager.remindSchedule(scheduleKey());
    await drainer.drainOnce({ limit: 10 });

    const [opening, ...afterRemind] = emailSender.sent;
    expect(opening).toMatchObject({
      kind: 'availability.opened',
      to: 'ana@test.com',
      answerBy: '2026-11-10',
    });
    expect(afterRemind).toHaveLength(2);
    expect(afterRemind).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'availability.reminder',
          to: 'ana@test.com',
          answerBy: '2026-11-20',
          deadlinePassed: true,
        }),
        expect.objectContaining({
          kind: 'availability.opened',
          to: 'bia@test.com',
          answerBy: '2026-11-20',
        }),
      ]),
    );
  });

  it('marks the Deadline passed only once the Church Timezone has left that day', async () => {
    const guitar = await seedRole({
      churchId: ids.churchId,
      ministryId: ids.ministryId,
      name: 'Guitar',
    });
    await seedNeededShift([guitar.id]);
    const userId = await seedRoleHolder('ana', guitar.id);
    await seedAsk('2026-11-20');
    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);

    // 02:30 UTC on the 21st is still 23:30 on the 20th in America/Sao_Paulo.
    setTestClock({ instant: '2026-11-21T02:30:00.000Z' as Instant });
    await enqueue('availability_reminder', userId);
    await drainer.drainOnce({ limit: 10 });
    setTestClock({ instant: '2026-11-21T03:30:00.000Z' as Instant });
    await enqueue('availability_reminder', userId);
    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.sent).toMatchObject([
      { answerBy: '2026-11-20', deadlinePassed: false },
      { answerBy: '2026-11-20', deadlinePassed: true },
    ]);
  });

  it('omits the Deadline when the ask has none, or there is no ask record', async () => {
    const userId = await seedRoleHolder(
      'ana',
      (
        await seedRole({
          churchId: ids.churchId,
          ministryId: ids.ministryId,
          name: 'Guitar',
        })
      ).id,
    );
    await enqueue('availability_opened', userId);
    const emailSender = new CaptureEmailSender('Church');
    const drainer = buildDrainer(emailSender);
    await drainer.drainOnce({ limit: 10 });
    await seedAsk(null);
    await enqueue('availability_reminder', userId);
    await drainer.drainOnce({ limit: 10 });

    expect(emailSender.sent).toHaveLength(2);
    for (const email of emailSender.sent) {
      expect(email).not.toHaveProperty('answerBy', expect.anything());
      expect(email).not.toHaveProperty('deadlinePassed', expect.anything());
    }
  });

  it.each([
    'availability_opened',
    'availability_reminder',
  ] as const)('%s delivers frozen legacy facts with the checks-list email link', async (kind) => {
    const userId = await seedRoleHolder(
      'ana',
      (
        await seedRole({
          churchId: ids.churchId,
          ministryId: ids.ministryId,
          name: 'Guitar',
        })
      ).id,
    );
    await enqueue(kind, userId);
    const oldFacts = {
      ...scope(),
      ministryName: 'Scheduling Ministry A',
      cycleName: 'December 2026',
      cycleStartDate: '2026-12-01',
      cycleEndDate: '2027-01-01',
      churchName: 'Scheduling Church A',
      actionUrl: 'https://app.test/dashboard?section=availability',
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
    expect(emailSender.sent[0]).toMatchObject({
      actionUrl: 'https://app.test/availability',
    });
    expect(emailSender.delivered[0]?.request.html).toContain(
      'https://app.test/availability',
    );
    expect(emailSender.delivered[0]?.request.text).toContain(
      m.notification_availability_span({
        startDate: '01/12/2026',
        endDate: '01/01/2027',
      }),
    );
    const inbox = await schedulingTestDb.select().from(notification);
    expect(inbox[0]?.data).toEqual(
      expect.not.objectContaining({ shiftCount: expect.anything() }),
    );
  });
});
