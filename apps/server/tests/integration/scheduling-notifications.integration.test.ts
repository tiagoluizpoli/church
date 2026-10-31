import { appConfig } from '@church/app-config';
import { notification, outboxMessage } from '@church/db';
import { eq } from 'drizzle-orm';
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
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import {
  DrizzleAvailabilityCheckRepository,
  DrizzleCycleRepository,
  DrizzleMinistryParticipationRepository,
  DrizzlePlanningEventRepository,
} from '@/infrastructure/repositories';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { buildChurchMembership } from '@/seeds/builders/church';
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

function buildDrainer(emailSender: CaptureEmailSender): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository,
    invitationRepository: harness.ministryInvitationRepository,
    churchRepository: harness.churchRepository,
    ministryRepository: harness.ministryRepository,
    roleRepository: harness.roleRepository,
    volunteerRepository: harness.volunteerRepository,
    volunteerTransferRepository: harness.volunteerTransferRepository,
    emailSender,
    notifier: harness.buildNotifier({ emailSender }),
    schedulingFacts: harness.schedulingFacts,
    unitOfWork,
    config: appConfig,
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
  it('Ask enqueues availability_opened per active member and delivers one email and one inbox entry each', async () => {
    const first = await seedMember({ name: 'Ana', email: 'ana@test.com' });
    const second = await seedMember({ name: 'Bia', email: 'bia@test.com' });

    await buildAvailabilityManager().askAvailability({
      churchId: ChurchId.from(ids.churchId),
      participationId: MinistryParticipationId.from(participationId),
    });

    const queued = await outboxRows();
    expect(queued).toHaveLength(3);
    expect(queued.map((row) => row.payload)).toContainEqual(
      expect.objectContaining({
        kind: 'availability_opened',
        to: { userId: first.volunteer.userId, churchId: ids.churchId },
        data: { cycleId, ministryId: ids.ministryId },
      }),
    );

    const emailSender = new CaptureEmailSender();
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

    const emailSender = new CaptureEmailSender();
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

    const emailSender = new CaptureEmailSender();
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

    const emailSender = new CaptureEmailSender();
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
