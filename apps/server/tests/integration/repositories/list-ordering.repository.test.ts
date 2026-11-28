import { availabilityCheck } from '@church/db';
import { parseInstant, parseTimeOfDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildAssignedShift,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import {
  createSchedulingPhase3Cycle,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const db = schedulingTestDb;

/** Fixed, ordered ids: `uuid(1)` sorts before `uuid(2)`. */
const uuid = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (value: string) => parseInstant({ value: `2026-08-${value}:00Z` });

// Rows are always inserted in an order that differs from the expected one.
async function seedBase() {
  const seed = await seedSchedulingPhase3Base();
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'Ordering cycle',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
  });
  return {
    seed,
    cycleId: cycle.id,
    churchId: ChurchId.from(seed.churchAId),
    ministryId: MinistryId.from(seed.ministryAId),
  };
}

async function seedEvent(input: {
  seed: { churchAId: string };
  cycleId: string;
  id?: string;
  start?: string;
}) {
  return buildEvent({
    db,
    churchId: input.seed.churchAId,
    cycleId: input.cycleId,
    id: input.id,
    title: 'Service',
    start: at(input.start ?? '02T09:00'),
    end: at('30T23:00'),
    status: 'scheduled',
  });
}

describe('repository list ordering', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  describe('event time blocks', () => {
    async function seedBlocks() {
      const base = await seedBase();
      const event = await seedEvent(base);
      // Expected: 1 (09:00), 2 (09:00, later id), 3 (10:00).
      for (const [n, start] of [
        [3, '02T10:00'],
        [2, '02T09:00'],
        [1, '02T09:00'],
      ] as const) {
        await buildEventTimeBlock({
          db,
          churchId: base.seed.churchAId,
          eventId: event.id,
          id: uuid(n),
          start: at(start),
          end: at('02T11:00'),
        });
      }
      return { ...base, event };
    }

    it('listByEvent returns blocks by start time, then id', async () => {
      const { churchId, event } = await seedBlocks();
      const repo = new DrizzleEventTimeBlockRepository({ db });
      const blocks = await repo.listByEvent({
        churchId,
        eventId: EventId.from(event.id),
      });
      expect(blocks.map((b) => b.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('findOverlapping returns blocks by start time, then id', async () => {
      const { churchId, event } = await seedBlocks();
      const repo = new DrizzleEventTimeBlockRepository({ db });
      const blocks = await repo.findOverlapping({
        churchId,
        eventId: EventId.from(event.id),
        startTime: new Date('2026-08-02T08:00:00Z'),
        endTime: new Date('2026-08-02T12:00:00Z'),
      });
      expect(blocks.map((b) => b.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });
  });

  describe('ministry participations', () => {
    async function seedParticipations() {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      // Expected: 1 and 2 (same early start, by id), then 3 (late).
      const late = await seedEvent({ ...base, start: '03T09:00' });
      const early2 = await seedEvent({ ...base, start: '01T09:00' });
      const early1 = await seedEvent({ ...base, start: '01T09:00' });
      for (const [n, ev] of [
        [3, late],
        [2, early2],
        [1, early1],
      ] as const) {
        await buildMinistryParticipation({
          db,
          churchId,
          ministryId: base.seed.ministryAId,
          eventId: ev.id,
          id: uuid(n),
          state: 'preparing',
          eventTimeBlockIds: [],
        });
      }
      return base;
    }

    it('listByMinistry returns participations by event start, then id', async () => {
      const { churchId, ministryId } = await seedParticipations();
      const repo = new DrizzleMinistryParticipationRepository({ db });
      const rows = await repo.listByMinistry({ churchId, ministryId });
      expect(rows.map((p) => p.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('listByIds returns participations by event start, then id', async () => {
      const { churchId } = await seedParticipations();
      const repo = new DrizzleMinistryParticipationRepository({ db });
      const rows = await repo.listByIds({
        churchId,
        participationIds: [3, 1, 2].map((n) =>
          MinistryParticipationId.from(uuid(n)),
        ),
      });
      expect(rows.map((p) => p.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('listByEvent returns participations by ministry name (case-insensitive), then ids', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const event = await seedEvent(base);
      const zeta = await buildMinistry({
        db,
        churchId,
        id: uuid(10),
        name: 'zeta',
      });
      const alpha = await buildMinistry({
        db,
        churchId,
        id: uuid(11),
        name: 'Alpha',
      });
      // 'Scheduling Ministry A' (seed) sorts between 'Alpha' and 'zeta'.
      for (const [n, ministryId] of [
        [3, zeta.id],
        [2, base.seed.ministryAId],
        [1, alpha.id],
      ] as const) {
        await buildMinistryParticipation({
          db,
          churchId,
          ministryId,
          eventId: event.id,
          id: uuid(n),
          state: 'preparing',
          eventTimeBlockIds: [],
        });
      }
      const repo = new DrizzleMinistryParticipationRepository({ db });
      const rows = await repo.listByEvent({
        churchId: base.churchId,
        eventId: EventId.from(event.id),
      });
      expect(rows.map((p) => p.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });
  });

  describe('volunteers', () => {
    // Expected by name: Alice, bob, Scheduling Admin (seed), Zed.
    async function seedVolunteers() {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const role = await buildRole({
        db,
        churchId,
        ministryId: base.seed.ministryAId,
        name: 'Singer',
      });
      for (const [n, name] of [
        [4, 'Zed'],
        [2, 'bob'],
        [1, 'Alice'],
      ] as const) {
        await buildVolunteerWithMembership({
          db,
          churchId,
          ministryId: base.seed.ministryAId,
          name,
          email: `${name.toLowerCase()}@test.com`,
          userId: `user-${name}`,
          volunteerId: uuid(n),
          roleIds: [role.id],
        });
      }
      return { ...base, roleId: role.id };
    }
    const byName = [uuid(1), uuid(2), 'admin', uuid(4)];

    it('listByMinistry returns volunteers by name, then id', async () => {
      const { churchId, ministryId, seed } = await seedVolunteers();
      const repo = new DrizzleVolunteerRepository({ db });
      const rows = await repo.listByMinistry({ churchId, ministryId });
      expect(rows.map((v) => v.id)).toEqual(
        byName.map((id) => (id === 'admin' ? seed.adminVolunteerId : id)),
      );
    });

    it('listQualifiedForRole returns volunteers by name, then id', async () => {
      const { churchId, ministryId, roleId } = await seedVolunteers();
      const repo = new DrizzleVolunteerRepository({ db });
      const rows = await repo.listQualifiedForRole({
        churchId,
        ministryId,
        roleId: roleId as never,
      });
      expect(rows.map((v) => v.id)).toEqual([uuid(1), uuid(2), uuid(4)]);
    });

    it('listByIds returns volunteers by name, then id', async () => {
      const { churchId, seed } = await seedVolunteers();
      const repo = new DrizzleVolunteerRepository({ db });
      const rows = await repo.listByIds({
        churchId,
        ids: [uuid(4), seed.adminVolunteerId, uuid(2), uuid(1)].map((id) =>
          VolunteerId.from(id),
        ),
      });
      expect(rows.map((v) => v.id)).toEqual(
        byName.map((id) => (id === 'admin' ? seed.adminVolunteerId : id)),
      );
    });

    it('listLedMinistries returns ministries by name (case-insensitive), then id', async () => {
      const { churchId, seed } = await seedBase();
      for (const [n, name] of [
        [2, 'zeta'],
        [1, 'Alpha'],
      ] as const) {
        const m = await buildMinistry({
          db,
          churchId: seed.churchAId,
          id: uuid(n),
          name,
        });
        await buildMinistryMembership({
          db,
          churchId: seed.churchAId,
          volunteerId: seed.adminVolunteerId,
          ministryId: m.id,
          ministryAccessLevel: 'leader',
          roleIds: [],
        });
      }
      const repo = new DrizzleVolunteerRepository({ db });
      const rows = await repo.listLedMinistries({
        churchId,
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
      });
      expect(rows.map((r) => r.ministryName)).toEqual([
        'Alpha',
        'Scheduling Ministry A',
        'zeta',
      ]);
    });
  });

  describe('usual setups', () => {
    async function seedSetups() {
      const base = await seedBase();
      const { blocks } = await buildEventTemplate({
        db,
        churchId: base.seed.churchAId,
        name: 'Sunday',
        recurrence: { kind: 'weekly', weekdays: [0] },
        blocks: ['Closing', 'Opening'].map((label, index) => ({
          label,
          startTime: parseTimeOfDay({ value: '09:00' }),
          endTime: parseTimeOfDay({ value: '10:00' }),
          order: 2 - index, // Closing=2, Opening=1
        })),
      });
      // Insert the order-2 block's setup first.
      for (const [n, block] of blocks.entries()) {
        await buildUsualSetup({
          db,
          churchId: base.seed.churchAId,
          ministryId: base.seed.ministryAId,
          sourceTemplateTimeBlockId: block.id,
          id: uuid(n + 1),
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [],
        });
      }
      // Closing (order 2) got uuid(1), Opening (order 1) got uuid(2).
      return base;
    }

    it('listByMinistry returns setups in template block order', async () => {
      const { churchId, ministryId } = await seedSetups();
      const repo = new DrizzleUsualSetupRepository({ db });
      const rows = await repo.listByMinistry({ churchId, ministryId });
      expect(rows.map((r) => r.id)).toEqual([uuid(2), uuid(1)]);
    });

    it('listByChurch returns setups in template block order', async () => {
      const { churchId } = await seedSetups();
      const repo = new DrizzleUsualSetupRepository({ db });
      const rows = await repo.listByChurch({ churchId });
      expect(rows.map((r) => r.id)).toEqual([uuid(2), uuid(1)]);
    });
  });

  describe('shifts', () => {
    async function seedShifts() {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const event = await seedEvent(base);
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId: base.seed.ministryAId,
        eventId: event.id,
        state: 'preparing',
        eventTimeBlockIds: [],
      });
      const block = await buildEventTimeBlock({
        db,
        churchId,
        eventId: event.id,
        start: at('02T09:00'),
        end: at('02T12:00'),
      });
      return { ...base, event, participation, block };
    }

    it('listRequirementsByParticipation returns requirements by sector, role, then id', async () => {
      const base = await seedShifts();
      const churchId = base.seed.churchAId;
      const ministryId = base.seed.ministryAId;
      const shift = await buildShift({
        db,
        churchId,
        participationId: base.participation.id,
        eventTimeBlockId: base.block.id,
        start: at('02T09:00'),
        end: at('02T12:00'),
      });
      const zulu = await buildSector({
        db,
        churchId,
        ministryId,
        name: 'Zulu',
      });
      const alpha = await buildSector({
        db,
        churchId,
        ministryId,
        name: 'alpha',
      });
      const roleA = await buildRole({ db, churchId, ministryId, name: 'a' });
      const roleY = await buildRole({ db, churchId, ministryId, name: 'Y' });
      // Expected: alpha/a (1), alpha/Y (2), Zulu/a (3).
      for (const [n, sector, role] of [
        [3, zulu, roleA],
        [2, alpha, roleY],
        [1, alpha, roleA],
      ] as const) {
        await buildShiftRequirement({
          db,
          churchId,
          participationId: base.participation.id,
          shiftId: shift.id,
          roleId: role.id,
          sectorId: sector.id,
          id: uuid(n),
          peopleNeeded: 1,
        });
      }
      const repo = new DrizzleShiftRepository({ db });
      const rows = await repo.listRequirementsByParticipation({
        churchId: base.churchId,
        participationId: MinistryParticipationId.from(base.participation.id),
      });
      expect(rows.map((r) => r.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('listConflictFacts returns shifts by start time, then id', async () => {
      const base = await seedShifts();
      const churchId = base.seed.churchAId;
      // Expected: 1 (09:00), 2 (09:00, later id), 3 (10:00).
      for (const [n, start] of [
        [3, '02T10:00'],
        [2, '02T09:00'],
        [1, '02T09:00'],
      ] as const) {
        await buildShift({
          db,
          churchId,
          participationId: base.participation.id,
          eventTimeBlockId: base.block.id,
          id: uuid(n),
          start: at(start),
          end: at('02T12:00'),
        });
      }
      const repo = new DrizzleShiftRepository({ db });
      const rows = await repo.listConflictFacts({
        churchId: base.churchId,
        shiftIds: [2, 3, 1].map((n) => ShiftId.from(uuid(n))),
      });
      expect(rows.map((r) => r.shift.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });
  });

  describe('planning events', () => {
    it('listMoveClashCandidates returns candidates by shift start, then assignment id', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const event = await seedEvent(base);
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId: base.seed.ministryAId,
        eventId: event.id,
        state: 'preparing',
        eventTimeBlockIds: [],
      });
      const role = await buildRole({
        db,
        churchId,
        ministryId: base.seed.ministryAId,
        name: 'Singer',
      });
      for (const start of ['02T11:00', '02T09:00', '02T10:00']) {
        await buildAssignedShift({
          db,
          churchId,
          eventId: event.id,
          participationId: participation.id,
          volunteerId: base.seed.adminVolunteerId,
          roleId: role.id,
          start: at(start),
          end: at('02T13:00'),
          status: 'pending',
        });
      }
      const repo = new DrizzlePlanningEventRepository({ db });
      const rows = await repo.listMoveClashCandidates({
        churchId: base.churchId,
        volunteerIds: [VolunteerId.from(base.seed.adminVolunteerId)],
        excludedEventTimeBlockIds: [],
        startTime: new Date('2026-08-02T00:00:00Z'),
        endTime: new Date('2026-08-03T00:00:00Z'),
      });
      expect(rows.map((r) => r.shiftStart)).toEqual([
        at('02T09:00'),
        at('02T10:00'),
        at('02T11:00'),
      ]);
    });

    it('seedParticipations returns ministries by name (case-insensitive), then id', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const event = await seedEvent(base);
      await buildMinistry({ db, churchId, id: uuid(2), name: 'zeta' });
      await buildMinistry({ db, churchId, id: uuid(1), name: 'Alpha' });
      const repo = new DrizzlePlanningEventRepository({ db });
      const seeded = await repo.seedParticipations({
        churchId: base.churchId,
        cycleId: CycleId.from(base.cycleId),
        eventId: EventId.from(event.id),
      });
      expect(seeded.map((m) => m.name)).toEqual([
        'Alpha',
        'Scheduling Ministry A',
        'zeta',
      ]);
    });
  });

  describe('availability checks', () => {
    it('listByCycle returns checks by creation time, then id', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      for (const n of [3, 2, 1]) {
        const { membership } = await buildVolunteerWithMembership({
          db,
          churchId,
          ministryId: base.seed.ministryAId,
          name: `Member ${n}`,
          email: `member${n}@test.com`,
        });
        await buildAvailabilityCheck({
          db,
          churchId,
          cycleId: base.cycleId,
          ministryMembershipId: membership.id,
          id: uuid(n),
        });
      }
      // Expected: 1 and 2 share the earliest time (by id), then 3.
      const early = new Date('2026-01-01T00:00:00Z');
      for (const [n, createdAt] of [
        [3, new Date('2026-01-02T00:00:00Z')],
        [2, early],
        [1, early],
      ] as const) {
        await db
          .update(availabilityCheck)
          .set({ createdAt })
          .where(eq(availabilityCheck.id, uuid(n)));
      }
      const repo = new DrizzleAvailabilityCheckRepository({ db });
      const rows = await repo.listByCycle({
        churchId: base.churchId,
        cycleId: CycleId.from(base.cycleId),
      });
      expect(rows.map((c) => c.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('listEligibleMemberships returns memberships by volunteer name, then membership id', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const ministryId = base.seed.ministryAId;
      const event = await seedEvent(base);
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId,
        eventId: event.id,
        state: 'preparing',
        eventTimeBlockIds: [],
      });
      const block = await buildEventTimeBlock({
        db,
        churchId,
        eventId: event.id,
        start: at('02T09:00'),
        end: at('02T12:00'),
      });
      const shift = await buildShift({
        db,
        churchId,
        participationId: participation.id,
        eventTimeBlockId: block.id,
        start: at('02T09:00'),
        end: at('02T12:00'),
      });
      const role = await buildRole({
        db,
        churchId,
        ministryId,
        name: 'Singer',
      });
      const sector = await buildSector({
        db,
        churchId,
        ministryId,
        name: 'Stage',
      });
      await buildShiftRequirement({
        db,
        churchId,
        participationId: participation.id,
        shiftId: shift.id,
        roleId: role.id,
        sectorId: sector.id,
        peopleNeeded: 1,
      });
      for (const [n, name] of [
        [3, 'Zed'],
        [2, 'bob'],
        [1, 'Alice'],
      ] as const) {
        await buildVolunteerWithMembership({
          db,
          churchId,
          ministryId,
          name,
          email: `${name.toLowerCase()}@test.com`,
          userId: `user-${name}`,
          volunteerId: uuid(n),
          roleIds: [role.id],
        });
      }
      const repo = new DrizzleAvailabilityCheckRepository({ db });
      const rows = await repo.listEligibleMemberships({
        churchId: base.churchId,
        ministryId: base.ministryId,
        cycleId: CycleId.from(base.cycleId),
      });
      expect(rows.map((m) => m.volunteerId)).toEqual([
        uuid(1),
        uuid(2),
        uuid(3),
      ]);
    });
  });

  describe('caller and Church picker reads', () => {
    it('resolveActor returns memberships by ministry name (case-insensitive), then id', async () => {
      const { churchId, seed } = await seedBase();
      for (const [n, name] of [
        [2, 'zeta'],
        [1, 'Alpha'],
      ] as const) {
        const m = await buildMinistry({
          db,
          churchId: seed.churchAId,
          id: uuid(n),
          name,
        });
        await buildMinistryMembership({
          db,
          churchId: seed.churchAId,
          volunteerId: seed.adminVolunteerId,
          ministryId: m.id,
          ministryAccessLevel: 'leader',
          roleIds: [],
        });
      }
      const resolver = new DrizzleAuthorityActorResolver({ db });
      const actor = await resolver.resolveActor({
        userId: UserId.from(seed.adminUserId),
        activeChurchId: churchId,
      });
      expect(actor.ministryMemberships.map((m) => m.ministryName)).toEqual([
        'Alpha',
        'Scheduling Ministry A',
        'zeta',
      ]);
    });

    it('resolveActor returns each membership’s qualified roles by role id', async () => {
      const { churchId, seed } = await seedBase();
      // A new Ministry: the seeded admin already belongs to the seeded one.
      const ministry = await buildMinistry({
        db,
        churchId: seed.churchAId,
        name: 'Choir',
      });
      for (const n of [2, 1]) {
        await buildRole({
          db,
          churchId: seed.churchAId,
          ministryId: ministry.id,
          id: uuid(n),
          name: `role ${n}`,
        });
      }
      await buildMinistryMembership({
        db,
        churchId: seed.churchAId,
        volunteerId: seed.adminVolunteerId,
        ministryId: ministry.id,
        ministryAccessLevel: 'volunteer',
        roleIds: [uuid(2), uuid(1)],
      });
      const resolver = new DrizzleAuthorityActorResolver({ db });
      const actor = await resolver.resolveActor({
        userId: UserId.from(seed.adminUserId),
        activeChurchId: churchId,
      });
      const membership = actor.ministryMemberships.find(
        (m) => m.ministryId === ministry.id,
      );
      expect(membership?.qualifiedRoleIds).toEqual([uuid(1), uuid(2)]);
    });

    /** The seeded admin joins two more Churches, inserted last name first. */
    async function seedChurches() {
      const { seed } = await seedBase();
      for (const [n, name] of [
        [2, 'zeta church'],
        [1, 'Alpha church'],
      ] as const) {
        await buildChurch({
          db,
          id: uuid(n),
          name,
          slug: `ordering-${n}`,
          timezone: 'UTC',
        });
        await buildChurchMembership({
          db,
          churchId: uuid(n),
          userId: seed.adminUserId,
          accessLevel: 'member',
        });
      }
      return seed;
    }

    it('listByUserId returns memberships by Church id', async () => {
      const seed = await seedChurches();
      const repo = new DrizzleChurchMembershipRepository({ db });
      const rows = await repo.listByUserId({
        userId: UserId.from(seed.adminUserId),
      });
      const ids = [seed.churchAId, uuid(2), uuid(1)].sort();
      expect(rows.map((r) => r.churchId)).toEqual(ids);
    });

    it('listComparisonsByUserId returns Churches by name (case-insensitive), then id', async () => {
      const seed = await seedChurches();
      const repo = new DrizzleChurchMembershipRepository({ db });
      const rows = await repo.listComparisonsByUserId({
        userId: UserId.from(seed.adminUserId),
      });
      expect(rows.map((r) => r.churchName)).toEqual([
        'Alpha church',
        'Scheduling Church A',
        'zeta church',
      ]);
    });

    it('listSchedulingScopes returns Churches by id', async () => {
      const seed = await seedChurches();
      const ids = [seed.churchAId, uuid(2), uuid(1)];
      const repo = new DrizzleSchedulingScopeResolver({ db });
      const rows = await repo.listSchedulingScopes({
        userId: UserId.from(seed.adminUserId),
        churchIds: ids.map((id) => ChurchId.from(id)),
      });
      expect(rows.map((r) => r.churchId)).toEqual([...ids].sort());
    });
  });

  describe('ministries needing review', () => {
    it('listNeedingReviewIds returns ministry ids in id order', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const { blocks } = await buildEventTemplate({
        db,
        churchId,
        name: 'Sunday',
        recurrence: { kind: 'weekly', weekdays: [0] },
        blocks: [
          {
            label: 'Morning',
            startTime: parseTimeOfDay({ value: '09:00' }),
            endTime: parseTimeOfDay({ value: '11:00' }),
          },
        ],
      });
      const [block] = blocks;
      if (!block) throw new Error('one block needed');
      // A span outside its block is what flags a Ministry.
      const outside = {
        startTime: parseTimeOfDay({ value: '02:00' }),
        endTime: parseTimeOfDay({ value: '03:00' }),
      };
      for (const n of [3, 1, 2]) {
        await buildMinistry({ db, churchId, id: uuid(n), name: `m${n}` });
        await buildUsualSetup({
          db,
          churchId,
          ministryId: uuid(n),
          sourceTemplateTimeBlockId: block.id,
          id: uuid(n + 10),
          serves: true,
          shiftSplit: { kind: 'manual', spans: [outside] },
          headcounts: [],
        });
      }
      const repo = new DrizzleMinistryRepository({ db });
      const ids = await repo.listNeedingReviewIds({
        churchId: base.churchId,
        ministryIds: [2, 3, 1].map((n) => MinistryId.from(uuid(n))),
      });
      expect(ids).toEqual([uuid(1), uuid(2), uuid(3)]);
    });
  });

  describe('volunteer counts and assignments', () => {
    it('countByVolunteer returns counts in state order', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const membership = await buildMinistryMembership({
        db,
        churchId,
        volunteerId: base.seed.adminVolunteerId,
        ministryId: base.seed.ministryAId,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });
      const second = await createSchedulingPhase3Cycle({
        churchId,
        name: 'Later cycle',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z'),
      });
      for (const [cycleId, state] of [
        [base.cycleId, 'confirmed'],
        [second.id, 'pending'],
      ] as const) {
        await buildAvailabilityCheck({
          db,
          churchId,
          cycleId,
          ministryMembershipId: membership.id,
          state,
        });
      }
      const repo = new DrizzleAvailabilityCheckRepository({ db });
      const rows = await repo.countByVolunteer({
        churchId: base.churchId,
        volunteerId: VolunteerId.from(base.seed.adminVolunteerId),
      });
      expect(rows).toEqual([
        { state: 'pending', checkCount: 1 },
        { state: 'confirmed', checkCount: 1 },
      ]);
    });

    it('listByParticipations follows the given participations, then shift start', async () => {
      const base = await seedBase();
      const churchId = base.seed.churchAId;
      const role = await buildRole({
        db,
        churchId,
        ministryId: base.seed.ministryAId,
        name: 'Singer',
      });
      const participationIds: string[] = [];
      // The first participation asked for holds the later Shifts.
      for (const starts of [
        ['03T11:00', '03T09:00'],
        ['02T11:00', '02T09:00'],
      ]) {
        const event = await seedEvent(base);
        const participation = await buildMinistryParticipation({
          db,
          churchId,
          ministryId: base.seed.ministryAId,
          eventId: event.id,
          state: 'preparing',
          eventTimeBlockIds: [],
        });
        participationIds.push(participation.id);
        for (const start of starts) {
          await buildAssignedShift({
            db,
            churchId,
            eventId: event.id,
            participationId: participation.id,
            volunteerId: base.seed.adminVolunteerId,
            roleId: role.id,
            start: at(start),
            end: at('04T13:00'),
            status: 'pending',
          });
        }
      }
      const repo = new DrizzleAssignmentRepository({ db });
      const asked = participationIds.map((id) =>
        MinistryParticipationId.from(id),
      );
      const rows = await repo.listByParticipations({
        churchId: base.churchId,
        participationIds: asked,
      });
      const shiftRepository = new DrizzleShiftRepository({ db });
      const shifts = await shiftRepository.listByIds({
        churchId: base.churchId,
        shiftIds: rows.map((row) => ShiftId.from(row.shiftId as string)),
      });
      const startOfShift = new Map(shifts.map((s) => [s.id, s.startTime]));
      expect(
        rows.map((row) => [
          row.participationId,
          startOfShift.get(row.shiftId as ShiftId),
        ]),
      ).toEqual([
        [participationIds[0], at('03T09:00')],
        [participationIds[0], at('03T11:00')],
        [participationIds[1], at('02T09:00')],
        [participationIds[1], at('02T11:00')],
      ]);
    });
  });
});
