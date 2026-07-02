import {
  assignment,
  availability,
  db,
  event,
  ministry,
  ministryVolunteer,
  role,
  timeSlot,
  user,
  volunteer,
  volunteerNotification,
} from '@church/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbVolunteerManager } from '../../src/application/db-volunteer-manager';
import type {
  AssignmentId,
  AvailabilityId,
  ChurchId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../src/domain/branded-ids';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleTeamRepository } from '../../src/infrastructure/repositories/drizzle-team.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const VOL_ID = 'bbbbbbbb-0001-0001-0001-bbbbbbbbbbbb' as VolunteerId;
const MINISTRY_ID = 'cccccccc-0001-0001-0001-cccccccccccc';
const ROLE_ID = 'dddddddd-0001-0001-0001-dddddddddddd';
const EVENT_ID = 'eeeeeeee-0001-0001-0001-eeeeeeeeeeee';
const SLOT_ID = 'ffffffff-0001-0001-0001-ffffffffffff';
const ASSIGNMENT_ID = 'a0000001-0001-0001-0001-000000000001' as AssignmentId;
const NOTIF_ID =
  'b0000001-0001-0001-0001-000000000001' as VolunteerNotificationId;

async function truncate() {
  await db.delete(volunteerNotification).where(sql`church_id = ${CHURCH}`);
  await db.delete(assignment).where(sql`church_id = ${CHURCH}`);
  await db.delete(availability).where(sql`church_id = ${CHURCH}`);
  await db.delete(timeSlot).where(sql`church_id = ${CHURCH}`);
  await db.delete(event).where(sql`church_id = ${CHURCH}`);
  await db.delete(role).where(sql`church_id = ${CHURCH}`);
  await db.delete(ministryVolunteer).where(sql`church_id = ${CHURCH}`);
  await db.delete(volunteer).where(sql`church_id = ${CHURCH}`);
  await db.delete(ministry).where(sql`church_id = ${CHURCH}`);
  await db.delete(user).where(sql`id = 'vol-user-01'`);
}

beforeAll(async () => {
  await truncate();

  await db.insert(user).values({
    id: 'vol-user-01',
    name: 'Vol User',
    email: 'voluser01@test.test',
    emailVerified: false,
  });

  await db.insert(ministry).values({
    id: MINISTRY_ID,
    churchId: CHURCH,
    name: 'Worship',
    enforcementType: 'soft',
  });

  await db.insert(role).values({
    id: ROLE_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    name: 'Musician',
    isGlobal: false,
  });

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(event).values({
    id: EVENT_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    title: 'Sunday Service',
    startDate: now,
    endDate: future,
    status: 'published',
    eventType: 'hourly',
  });

  const slotStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);

  await db.insert(timeSlot).values({
    id: SLOT_ID,
    churchId: CHURCH,
    eventId: EVENT_ID,
    startTime: slotStart,
    endTime: slotEnd,
  });

  await db.insert(volunteer).values({
    id: VOL_ID,
    churchId: CHURCH,
    userId: 'vol-user-01',
    status: 'active',
  });

  await db.insert(ministryVolunteer).values({
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    volunteerId: VOL_ID,
    systemRole: 'volunteer',
  });

  await db.insert(assignment).values({
    id: ASSIGNMENT_ID,
    churchId: CHURCH,
    slotId: SLOT_ID as unknown as string,
    volunteerId: VOL_ID,
    roleId: ROLE_ID as unknown as string,
    status: 'pending',
  });

  await db.insert(volunteerNotification).values({
    id: NOTIF_ID,
    churchId: CHURCH,
    volunteerId: VOL_ID,
    type: 'assignment_added',
    title: 'New Assignment',
    body: 'You have a new assignment',
    payload: {},
  });
});

afterAll(async () => {
  await truncate();
});

function makeManager() {
  const volunteerRepo = new DrizzleVolunteerRepository(db);
  const assignmentRepo = new DrizzleAssignmentRepository(db);
  const availabilityRepo = new DrizzleAvailabilityRepository(db);
  const notificationRepo = new DrizzleVolunteerNotificationRepository(db);
  const eventRepo = new DrizzleEventRepository(db);
  const timeSlotRepo = new DrizzleTimeSlotRepository(db);
  const ministryRepo = new DrizzleMinistryRepository(db);
  const roleRepo = new DrizzleRoleRepository(db);
  const teamRepo = new DrizzleTeamRepository(db);
  return new DbVolunteerManager(
    volunteerRepo,
    assignmentRepo,
    availabilityRepo,
    notificationRepo,
    eventRepo,
    timeSlotRepo,
    ministryRepo,
    roleRepo,
    teamRepo,
  );
}

describe('DbVolunteerManager (T040)', () => {
  describe('getDashboard', () => {
    it('returns upcoming assignments and unread count', async () => {
      const manager = makeManager();
      const result = await manager.getDashboard({
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      expect(result.upcomingAssignmentGroups.length).toBeGreaterThanOrEqual(1);
      expect(typeof result.unreadNotificationCount).toBe('number');
      expect(result.unreadNotificationCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUpcomingAssignments', () => {
    it('returns assignments in 30-day window', async () => {
      const manager = makeManager();
      const result = await manager.getUpcomingAssignments({
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.volunteerId).toBe(VOL_ID);
    });

    it('returns empty for unknown volunteer', async () => {
      const manager = makeManager();
      const result = await manager.getUpcomingAssignments({
        volunteerId: '00000000-ffff-ffff-ffff-000000000000' as VolunteerId,
        churchId: CHURCH,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('getMinistrySchedule', () => {
    it('returns assignments for volunteer', async () => {
      const manager = makeManager();
      const result = await manager.getMinistrySchedule({
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.rows).toHaveLength(1);
    });
  });

  describe('availability CRUD', () => {
    let createdAvailId: AvailabilityId;
    const start = new Date('2026-08-01T09:00:00Z');
    const end = new Date('2026-08-01T17:00:00Z');

    it('upsertAvailability creates new entry', async () => {
      const manager = makeManager();
      const result = await manager.upsertAvailability({
        volunteerId: VOL_ID,
        churchId: CHURCH,
        type: 'available',
        startTime: start,
        endTime: end,
        isAllDay: false,
        reason: 'Test entry',
      });
      expect(result.id).toBeTruthy();
      expect(result.type).toBe('available');
      createdAvailId = result.id as AvailabilityId;
    });

    it('getAvailability returns created entry', async () => {
      const manager = makeManager();
      const items = await manager.getAvailability({
        volunteerId: VOL_ID,
        churchId: CHURCH,
        startTime: start,
        endTime: end,
      });
      expect(items.some((a) => a.id === createdAvailId)).toBe(true);
    });

    it('upsertAvailability updates existing entry', async () => {
      const manager = makeManager();
      const updated = await manager.upsertAvailability({
        volunteerId: VOL_ID,
        churchId: CHURCH,
        availabilityId: createdAvailId,
        type: 'unavailable',
        startTime: start,
        endTime: end,
        isAllDay: false,
        reason: 'Changed',
      });
      expect(updated.type).toBe('unavailable');
    });

    it('deleteAvailability removes entry', async () => {
      const manager = makeManager();
      await manager.deleteAvailability({
        availabilityId: createdAvailId,
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      const items = await manager.getAvailability({
        volunteerId: VOL_ID,
        churchId: CHURCH,
        startTime: start,
        endTime: end,
      });
      expect(items.some((a) => a.id === createdAvailId)).toBe(false);
    });
  });

  describe('respondToAssignment', () => {
    it('accept changes status to confirmed', async () => {
      const manager = makeManager();
      const result = await manager.respondToAssignment({
        assignmentId: ASSIGNMENT_ID,
        volunteerId: VOL_ID,
        churchId: CHURCH,
        response: 'accepted',
      });
      expect(result.status).toBe('confirmed');
    });

    it('decline changes status to declined', async () => {
      const manager = makeManager();

      const assignmentRepo = new DrizzleAssignmentRepository(db);
      await assignmentRepo.updateStatus(CHURCH, ASSIGNMENT_ID, {
        status: 'pending',
      });

      const result = await manager.respondToAssignment({
        assignmentId: ASSIGNMENT_ID,
        volunteerId: VOL_ID,
        churchId: CHURCH,
        response: 'declined',
        reason: 'Busy',
      });
      expect(result.status).toBe('declined');
    });
  });

  describe('notifications', () => {
    it('getNotifications returns seeded notification', async () => {
      const manager = makeManager();
      const result = await manager.getNotifications({
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.some((n) => n.id === NOTIF_ID)).toBe(true);
    });

    it('markNotificationRead sets readAt', async () => {
      const manager = makeManager();
      await manager.markNotificationRead({
        notificationId: NOTIF_ID,
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      const unread = await new DrizzleVolunteerNotificationRepository(
        db,
      ).countUnread(CHURCH, VOL_ID);
      expect(unread).toBe(0);
    });

    it('markAllNotificationsRead marks all read', async () => {
      await db.insert(volunteerNotification).values({
        id: 'c0000001-0001-0001-0001-000000000002' as string,
        churchId: CHURCH,
        volunteerId: VOL_ID,
        type: 'assignment_reminder',
        title: 'Reminder',
        body: 'Reminder body',
        payload: {},
      });
      const manager = makeManager();
      await manager.markAllNotificationsRead({
        volunteerId: VOL_ID,
        churchId: CHURCH,
      });
      const unread = await new DrizzleVolunteerNotificationRepository(
        db,
      ).countUnread(CHURCH, VOL_ID);
      expect(unread).toBe(0);
    });
  });
});
