import {
  assignment,
  db,
  event,
  ministry,
  role,
  timeSlot,
  user,
  volunteer,
} from '@church/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import type { AssignmentId } from '../../src/domain/entities/assignment';
import type { ChurchId } from '../../src/domain/entities/church';
import type { UserId, VolunteerId } from '../../src/domain/entities/volunteer';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '../../src/infrastructure/repositories/drizzle-assignment-audit.repository';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const MINISTRY_ID = 'f1111111-0001-0001-0001-f11111111111';
const ROLE_ID = 'f2222222-0001-0001-0001-f22222222222';
const EVENT_ID = 'f3333333-0001-0001-0001-f33333333333';
const SLOT_ID = 'f4444444-0001-0001-0001-f44444444444';
const VOL_ID = 'f5555555-0001-0001-0001-f55555555555' as VolunteerId;
const ACTOR_ID = 'asgn-actor-user-01' as UserId;

async function truncate() {
  await db.delete(assignment).where(sql`slot_id = ${SLOT_ID}`);
  await db.delete(timeSlot).where(sql`id = ${SLOT_ID}`);
  await db.delete(event).where(sql`id = ${EVENT_ID}`);
  await db.delete(role).where(sql`id = ${ROLE_ID}`);
  await db.delete(volunteer).where(sql`id = ${VOL_ID}`);
  await db.delete(ministry).where(sql`id = ${MINISTRY_ID}`);
  await db.delete(user).where(sql`id = 'asgn-actor-user-01'`);
}

beforeAll(async () => {
  await truncate();

  await db.insert(user).values({
    id: 'asgn-actor-user-01',
    name: 'Actor',
    email: 'actor01@test.test',
    emailVerified: false,
  });
  await db.insert(ministry).values({
    id: MINISTRY_ID,
    churchId: CHURCH,
    name: 'Assignments Ministry',
    enforcementType: 'soft',
  });
  await db.insert(role).values({
    id: ROLE_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    name: 'Assign Role',
    isGlobal: false,
  });
  await db.insert(volunteer).values({
    id: VOL_ID,
    churchId: CHURCH,
    userId: 'asgn-actor-user-01',
    status: 'active',
  });

  const slotStart = new Date('2026-11-01T10:00:00Z');
  const slotEnd = new Date('2026-11-01T12:00:00Z');

  await db.insert(event).values({
    id: EVENT_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    title: 'Assignment Test Event',
    startDate: slotStart,
    endDate: slotEnd,
    status: 'published',
    eventType: 'hourly',
  });

  await db.insert(timeSlot).values({
    id: SLOT_ID,
    churchId: CHURCH,
    eventId: EVENT_ID,
    startTime: slotStart,
    endTime: slotEnd,
  });
});

afterAll(async () => {
  await truncate();
});

function makeManager() {
  const assignmentRepo = new DrizzleAssignmentRepository(db);
  const auditRepo = new DrizzleAssignmentAuditRepository(db);
  return new DbAssignmentManager(assignmentRepo, auditRepo);
}

describe('DbAssignmentManager (T058)', () => {
  let assignmentId: AssignmentId;

  describe('createAssignment', () => {
    it('creates assignment and audit entry', async () => {
      const manager = makeManager();
      const result = await manager.createAssignment({
        churchId: CHURCH,
        slotId:
          SLOT_ID as import('../../src/domain/entities/time-slot').TimeSlotId,
        volunteerId: VOL_ID,
        roleId: ROLE_ID as import('../../src/domain/entities/role').RoleId,
        actorId: ACTOR_ID,
      });
      expect(result.id).toBeTruthy();
      expect(result.status).toBe('pending');
      expect(result.volunteerId as string).toBe(VOL_ID);
      assignmentId = result.id as AssignmentId;
    });
  });

  describe('listAuditLog', () => {
    it('returns audit entries for assignment', async () => {
      const manager = makeManager();
      const items = await manager.listAuditLog({
        assignmentId,
        churchId: CHURCH,
      });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]?.action).toBe('created');
    });
  });

  describe('deleteAssignment', () => {
    it('removes the assignment', async () => {
      const manager = makeManager();
      await manager.deleteAssignment({ assignmentId, churchId: CHURCH });

      const assignmentRepo = new DrizzleAssignmentRepository(db);
      const remaining = await assignmentRepo.listByVolunteer(CHURCH, VOL_ID);
      expect(remaining.every((a) => a.id !== assignmentId)).toBe(true);
    });
  });
});
