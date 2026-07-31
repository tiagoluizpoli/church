import { NotFoundError } from '@church/core';
import { role, team } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
} from '../../../src/domain/branded-ids';
import { Shift } from '../../../src/domain/entities/shift';
import { DrizzleShiftRepository } from '../../../src/infrastructure/repositories/drizzle-shift.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

async function seedParticipationGraph(churchId: string, ministryId: string) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Sunday Service',
    startDate: new Date('2026-08-02T09:00:00.000Z'),
    endDate: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });
  return graph;
}

describe('DrizzleShiftRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('createMany returns [] for an empty input and inserts shifts otherwise', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const empty = await repo.createMany({ churchId, shifts: [] });
    expect(empty).toEqual([]);

    const shiftEntity = new Shift({
      props: {
        churchId,
        participationId: MinistryParticipationId.from(graph.participation.id),
        timeSlotId: TimeSlotId.from(graph.slot.id),
        startTime: graph.slot.startTime,
        endTime: graph.slot.endTime,
        label: 'Whole slot',
      },
    });

    const created = await repo.createMany({
      churchId,
      shifts: [shiftEntity],
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.id).toBe(shiftEntity.id);
    expect(created[0]?.label).toBe('Whole slot');
  });

  it('getById throws NotFoundError for an invalid uuid and for a missing/foreign-church shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getById({ churchId, shiftId: ShiftId.from('not-a-uuid') }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getById({
        churchId,
        shiftId: ShiftId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);

    const [created] = await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId: MinistryParticipationId.from(
              graph.participation.id,
            ),
            timeSlotId: TimeSlotId.from(graph.slot.id),
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
          },
        }),
      ],
    });
    if (!created) throw new Error('setup failed');

    await expect(
      repo.getById({
        churchId: ChurchId.from(seed.churchBId),
        shiftId: created.id,
      }),
    ).rejects.toThrow(NotFoundError);

    const found = await repo.getById({ churchId, shiftId: created.id });
    expect(found.id).toBe(created.id);
  });

  it('listByParticipation orders by startTime and listBySlot filters by slot', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(
      graph.participation.id,
    );
    const timeSlotId = TimeSlotId.from(graph.slot.id);

    const later = new Shift({
      props: {
        churchId,
        participationId,
        timeSlotId,
        startTime: new Date('2026-08-02T10:00:00.000Z'),
        endTime: new Date('2026-08-02T11:00:00.000Z'),
      },
    });
    const earlier = new Shift({
      props: {
        churchId,
        participationId,
        timeSlotId,
        startTime: new Date('2026-08-02T09:00:00.000Z'),
        endTime: new Date('2026-08-02T09:30:00.000Z'),
      },
    });

    await repo.createMany({ churchId, shifts: [later, earlier] });

    const byParticipation = await repo.listByParticipation({
      churchId,
      participationId,
    });
    expect(byParticipation.map((s) => s.id)).toEqual([earlier.id, later.id]);

    const bySlot = await repo.listBySlot({
      churchId,
      participationId,
      timeSlotId,
    });
    expect(bySlot).toHaveLength(2);
  });

  it('update applies only provided fields and throws NotFoundError when missing', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const [created] = await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId: MinistryParticipationId.from(
              graph.participation.id,
            ),
            timeSlotId: TimeSlotId.from(graph.slot.id),
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
            label: 'Original',
          },
        }),
      ],
    });
    if (!created) throw new Error('setup failed');

    const updated = await repo.update({
      churchId,
      shiftId: created.id,
      label: 'Renamed',
    });
    expect(updated.label).toBe('Renamed');
    expect(updated.startTime).toEqual(created.startTime);

    await expect(
      repo.update({
        churchId,
        shiftId: ShiftId.from('99999999-9999-4999-8999-999999999999'),
        label: 'Nope',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('update applies startTime and endTime when label is omitted', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const [created] = await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId: MinistryParticipationId.from(
              graph.participation.id,
            ),
            timeSlotId: TimeSlotId.from(graph.slot.id),
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
            label: 'Keep me',
          },
        }),
      ],
    });
    if (!created) throw new Error('setup failed');

    const newStart = new Date('2026-08-02T10:00:00.000Z');
    const newEnd = new Date('2026-08-02T10:30:00.000Z');
    const updated = await repo.update({
      churchId,
      shiftId: created.id,
      startTime: newStart,
      endTime: newEnd,
    });

    expect(updated.startTime).toEqual(newStart);
    expect(updated.endTime).toEqual(newEnd);
    expect(updated.label).toBe('Keep me');
  });

  it('deleteById and deleteBySlot remove shifts', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(
      graph.participation.id,
    );
    const timeSlotId = TimeSlotId.from(graph.slot.id);

    const [toDelete] = await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId,
            timeSlotId,
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
          },
        }),
      ],
    });
    if (!toDelete) throw new Error('setup failed');

    await repo.deleteById({ churchId, shiftId: toDelete.id });
    await expect(
      repo.getById({ churchId, shiftId: toDelete.id }),
    ).rejects.toThrow(NotFoundError);

    await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId,
            timeSlotId,
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
          },
        }),
      ],
    });
    await repo.deleteBySlot({ churchId, participationId, timeSlotId });
    expect(
      await repo.listBySlot({ churchId, participationId, timeSlotId }),
    ).toEqual([]);
  });

  it('upsertRequirement inserts then updates by (shift, role, team) and lists by participation', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedParticipationGraph(
      seed.churchAId,
      seed.ministryAId,
    );
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(
      graph.participation.id,
    );
    const [shift] = await repo.createMany({
      churchId,
      shifts: [
        new Shift({
          props: {
            churchId,
            participationId,
            timeSlotId: TimeSlotId.from(graph.slot.id),
            startTime: graph.slot.startTime,
            endTime: graph.slot.endTime,
          },
        }),
      ],
    });
    if (!shift) throw new Error('setup failed');
    const [roleRow] = await schedulingTestDb
      .insert(role)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Usher',
      })
      .returning();
    if (!roleRow) throw new Error('role seed failed');
    const roleId = RoleId.from(roleRow.id);

    const inserted = await repo.upsertRequirement({
      churchId,
      shiftId: shift.id,
      participationId,
      roleId,
      requiredCount: 2,
      notes: 'initial',
    });
    expect(inserted.requiredCount).toBe(2);

    const updated = await repo.upsertRequirement({
      churchId,
      shiftId: shift.id,
      participationId,
      roleId,
      requiredCount: 5,
      notes: 'updated',
    });
    expect(updated.id).toBe(inserted.id);
    expect(updated.requiredCount).toBe(5);

    // Distinct teamId creates a separate requirement row for the same shift/role.
    const [teamRow] = await schedulingTestDb
      .insert(team)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Team A',
      })
      .returning();
    if (!teamRow) throw new Error('team seed failed');
    const teamId = TeamId.from(teamRow.id);
    const withTeam = await repo.upsertRequirement({
      churchId,
      shiftId: shift.id,
      participationId,
      roleId,
      teamId,
      requiredCount: 1,
    });
    expect(withTeam.id).not.toBe(updated.id);

    const requirements = await repo.listRequirementsByParticipation({
      churchId,
      participationId,
    });
    expect(requirements).toHaveLength(2);
  });
});
