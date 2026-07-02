import {
  db,
  event,
  ministry,
  ministryVolunteer,
  role,
  timeSlot,
  user,
  volunteer,
} from '@church/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbEventManager } from '../../src/application/db-event-manager';
import type { ChurchId, EventId } from '../../src/domain/branded-ids';
import { InvalidDateRangeError } from '../../src/domain/errors/invalid-date-range';
import { IsolationBreachError } from '../../src/domain/errors/isolation-breach-error';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { LocalNotificationService } from '../../src/infrastructure/services/local-notification-service';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const MINISTRY_ID = 'e1111111-0001-0001-0001-e11111111111';
const ROLE_ID = 'e2222222-0001-0001-0001-e22222222222';

async function truncate() {
  await db
    .delete(timeSlot)
    .where(
      sql`church_id = ${CHURCH} AND event_id IN (SELECT id FROM event WHERE church_id = ${CHURCH} AND ministry_id = ${MINISTRY_ID})`,
    );
  await db
    .delete(event)
    .where(sql`church_id = ${CHURCH} AND ministry_id = ${MINISTRY_ID}`);
  await db.delete(role).where(sql`id = ${ROLE_ID}`);
  await db.delete(ministryVolunteer).where(sql`ministry_id = ${MINISTRY_ID}`);
  await db.delete(ministry).where(sql`id = ${MINISTRY_ID}`);
  await db
    .delete(volunteer)
    .where(
      sql`church_id = ${CHURCH} AND user_id IN ('ev-user-01', 'ev-user-02')`,
    );
  await db.delete(user).where(sql`id IN ('ev-user-01', 'ev-user-02')`);
}

beforeAll(async () => {
  await truncate();

  await db.insert(user).values({
    id: 'ev-user-01',
    name: 'Event User',
    email: 'evuser01@test.test',
    emailVerified: false,
  });
  await db.insert(user).values({
    id: 'ev-user-02',
    name: 'Event Volunteer User',
    email: 'evuser02@test.test',
    emailVerified: false,
  });
  await db.insert(ministry).values({
    id: MINISTRY_ID,
    churchId: CHURCH,
    name: 'Events Ministry',
    enforcementType: 'soft',
  });
  await db.insert(role).values({
    id: ROLE_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    name: 'Event Role',
    isGlobal: false,
  });
  await db.insert(volunteer).values({
    id: 'e3333333-0001-0001-0001-e33333333333',
    churchId: CHURCH,
    userId: 'ev-user-01',
    status: 'active',
  });
  await db.insert(ministryVolunteer).values({
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    volunteerId: 'e3333333-0001-0001-0001-e33333333333',
    systemRole: 'leader',
  });
  await db.insert(volunteer).values({
    id: 'e3333333-0002-0002-0002-e33333333332',
    churchId: CHURCH,
    userId: 'ev-user-02',
    status: 'active',
  });
  await db.insert(ministryVolunteer).values({
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    volunteerId: 'e3333333-0002-0002-0002-e33333333332',
    systemRole: 'volunteer',
  });
});

afterAll(async () => {
  await truncate();
});

function makeManager() {
  const eventRepo = new DrizzleEventRepository(db);
  const slotRepo = new DrizzleTimeSlotRepository(db);
  const assignmentRepo = new DrizzleAssignmentRepository(db);
  const availabilityRepo = new DrizzleAvailabilityRepository(db);
  const volunteerRepo = new DrizzleVolunteerRepository(db);
  const roleRepo = new DrizzleRoleRepository(db);
  const notificationRepo = new DrizzleVolunteerNotificationRepository(db);
  const notificationService = new LocalNotificationService(notificationRepo);
  return new DbEventManager(
    eventRepo,
    slotRepo,
    assignmentRepo,
    availabilityRepo,
    volunteerRepo,
    roleRepo,
    notificationService,
  );
}

const futureStart = new Date('2026-09-01T09:00:00Z');
const futureEnd = new Date('2026-09-01T17:00:00Z');

describe('DbEventManager (T049)', () => {
  let createdEventId: EventId;

  describe('createEvent', () => {
    it('creates event with valid dates', async () => {
      const manager = makeManager();
      const ev = await manager.createEvent({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        title: 'Test Event',
        startDate: futureStart,
        endDate: futureEnd,
      });
      expect(ev.id).toBeTruthy();
      expect(ev.title).toBe('Test Event');
      expect(ev.status).toBe('draft');
      createdEventId = ev.id as EventId;
    });

    it('throws INVALID_DATE_RANGE when startDate >= endDate', async () => {
      const manager = makeManager();
      await expect(
        manager.createEvent({
          churchId: CHURCH,
          ministryId:
            MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
          title: 'Bad Dates',
          startDate: futureEnd,
          endDate: futureStart,
        }),
      ).rejects.toThrow(InvalidDateRangeError);
    });
  });

  describe('listEvents', () => {
    it('returns created event', async () => {
      const manager = makeManager();
      const events = await manager.listEvents({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
      });
      expect(events.some((e) => e.id === createdEventId)).toBe(true);
    });

    it('filters by status', async () => {
      const manager = makeManager();
      const events = await manager.listEvents({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        status: 'published',
      });
      expect(events.every((e) => e.status === 'published')).toBe(true);
    });
  });

  describe('publishEvent / cancelEvent', () => {
    it('publishEvent changes status to published', async () => {
      const manager = makeManager();
      await manager.publishEvent({ eventId: createdEventId, churchId: CHURCH });
      const events = await manager.listEvents({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        status: 'published',
      });
      expect(events.some((e) => e.id === createdEventId)).toBe(true);
    });

    it('cancelEvent changes status to cancelled', async () => {
      const manager = makeManager();
      await manager.cancelEvent({ eventId: createdEventId, churchId: CHURCH });
      const events = await manager.listEvents({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        status: 'cancelled',
      });
      expect(events.some((e) => e.id === createdEventId)).toBe(true);
    });
  });

  describe('slot management', () => {
    let slotId: string;
    const slotStart = new Date('2026-09-01T10:00:00Z');
    const slotEnd = new Date('2026-09-01T12:00:00Z');

    it('createSlot adds slot to event', async () => {
      const manager = makeManager();
      const slot = await manager.createSlot({
        churchId: CHURCH,
        eventId: createdEventId,
        startTime: slotStart,
        endTime: slotEnd,
        label: 'Morning',
      });
      expect(slot.id).toBeTruthy();
      expect(slot.label).toBe('Morning');
      slotId = slot.id as string;
    });

    it('updateSlot updates label', async () => {
      const manager = makeManager();
      const updated = await manager.updateSlot({
        churchId: CHURCH,
        slotId: slotId as import('../../src/domain/branded-ids').TimeSlotId,
        label: 'Updated Morning',
      });
      expect(updated.label).toBe('Updated Morning');
    });

    it('upsertSlotRequirement creates requirement', async () => {
      const manager = makeManager();
      const req = await manager.upsertSlotRequirement({
        churchId: CHURCH,
        slotId: slotId as import('../../src/domain/branded-ids').TimeSlotId,
        roleId: ROLE_ID as import('../../src/domain/branded-ids').RoleId,
        requiredCount: 2,
      });
      expect(req.requiredCount).toBe(2);
      expect(req.roleId as string).toBe(ROLE_ID);
    });

    it('deleteSlot removes slot', async () => {
      const manager = makeManager();
      await manager.deleteSlot({
        slotId: slotId as import('../../src/domain/branded-ids').TimeSlotId,
        churchId: CHURCH,
      });
      const slotRepo = new DrizzleTimeSlotRepository(db);
      const remaining = await slotRepo.listByEvent(CHURCH, createdEventId);
      expect(remaining.every((s) => s.id !== slotId)).toBe(true);
    });
  });

  describe('generateSlots', () => {
    it('generates equal-split slots', async () => {
      const manager = makeManager();

      const newEvent = await manager.createEvent({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        title: 'Generate Test',
        startDate: new Date('2026-10-01T09:00:00Z'),
        endDate: new Date('2026-10-01T11:00:00Z'),
      });

      const slots = await manager.generateSlots({
        churchId: CHURCH,
        eventId: newEvent.id as EventId,
        strategy: { kind: 'equal-split', slotDurationMinutes: 60 },
      });
      expect(slots).toHaveLength(2);
    });
  });

  describe('getScheduleBuilderData', () => {
    it('returns data with events field', async () => {
      const manager = makeManager();
      const event = await manager.createEvent({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        title: 'Builder Test',
        startDate: new Date('2026-11-01T09:00:00Z'),
        endDate: new Date('2026-11-01T17:00:00Z'),
      });
      const data = await manager.getScheduleBuilderData({
        churchId: CHURCH,
        eventId: event.id as EventId,
        volunteerId:
          'e3333333-0001-0001-0001-e33333333333' as import('../../src/domain/branded-ids').VolunteerId,
      });
      expect(data).toHaveProperty('events');
      expect(data).toHaveProperty('assignments');
      expect(data).toHaveProperty('availability');
      expect(data).toHaveProperty('volunteers');
    });

    it('throws IsolationBreachError for non-leader/sub-leader volunteers', async () => {
      const manager = makeManager();
      const event = await manager.createEvent({
        churchId: CHURCH,
        ministryId:
          MINISTRY_ID as import('../../src/domain/branded-ids').MinistryId,
        title: 'Builder Test',
        startDate: new Date('2026-11-01T09:00:00Z'),
        endDate: new Date('2026-11-01T17:00:00Z'),
      });
      await expect(
        manager.getScheduleBuilderData({
          churchId: CHURCH,
          eventId: event.id as EventId,
          volunteerId:
            'e3333333-0002-0002-0002-e33333333332' as import('../../src/domain/branded-ids').VolunteerId,
        }),
      ).rejects.toThrow(IsolationBreachError);
    });
  });

  describe('sendReminder', () => {
    it('resolves without error', async () => {
      const manager = makeManager();
      await expect(
        manager.sendReminder({ eventId: createdEventId, churchId: CHURCH }),
      ).resolves.toBeUndefined();
    });
  });
});
