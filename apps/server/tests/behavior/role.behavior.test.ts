import {
  db,
  event,
  ministry,
  role,
  roleTemplate,
  roleTemplateItem,
  timeSlot,
} from '@church/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbRoleManager } from '../../src/application/db-role-manager';
import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  RoleTemplateId,
} from '../../src/domain/branded-ids';
import { DrizzleRoleTemplateRepository } from '../../src/infrastructure/repositories/drizzle-role-template.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const MINISTRY_ID = 'c1111111-0001-0001-0001-c11111111111' as MinistryId;
const ROLE_ID = 'c2222222-0001-0001-0001-c22222222222' as RoleId;
const EVENT_ID = 'c3333333-0001-0001-0001-c33333333333' as EventId;
const SLOT_ID = 'c4444444-0001-0001-0001-c44444444444';

async function truncate() {
  await db
    .delete(roleTemplateItem)
    .where(
      sql`template_id IN (SELECT id FROM role_template WHERE church_id = ${CHURCH} AND ministry_id = ${MINISTRY_ID})`,
    );
  await db
    .delete(roleTemplate)
    .where(sql`church_id = ${CHURCH} AND ministry_id = ${MINISTRY_ID}`);
  await db.delete(timeSlot).where(sql`id = ${SLOT_ID}`);
  await db.delete(event).where(sql`id = ${EVENT_ID}`);
  await db.delete(role).where(sql`id = ${ROLE_ID}`);
  await db.delete(ministry).where(sql`id = ${MINISTRY_ID}`);
}

beforeAll(async () => {
  await truncate();

  await db.insert(ministry).values({
    id: MINISTRY_ID,
    churchId: CHURCH,
    name: 'Role Test Ministry',
    enforcementType: 'soft',
  });

  await db.insert(role).values({
    id: ROLE_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    name: 'Role Template Role',
    isGlobal: false,
  });

  const slotStart = new Date('2026-12-01T10:00:00Z');
  const slotEnd = new Date('2026-12-01T12:00:00Z');

  await db.insert(event).values({
    id: EVENT_ID,
    churchId: CHURCH,
    ministryId: MINISTRY_ID,
    title: 'Role Template Event',
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
  const roleTemplateRepo = new DrizzleRoleTemplateRepository(db);
  const timeSlotRepo = new DrizzleTimeSlotRepository(db);
  return new DbRoleManager(roleTemplateRepo, timeSlotRepo);
}

describe('DbRoleManager (T066)', () => {
  let createdTemplateId: RoleTemplateId;

  describe('upsertTemplate — create', () => {
    it('creates a new role template', async () => {
      const manager = makeManager();
      const template = await manager.upsertTemplate({
        churchId: CHURCH,
        ministryId: MINISTRY_ID,
        name: 'Sunday Template',
        items: [{ roleId: ROLE_ID, requiredCount: 2 }],
      });
      expect(template.id).toBeTruthy();
      expect(template.name).toBe('Sunday Template');
      expect(template.items).toHaveLength(1);
      expect(template.items[0]?.requiredCount).toBe(2);
      createdTemplateId = template.id as RoleTemplateId;
    });
  });

  describe('listTemplates', () => {
    it('lists templates for ministry', async () => {
      const manager = makeManager();
      const templates = await manager.listTemplates({
        churchId: CHURCH,
        ministryId: MINISTRY_ID,
      });
      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect(templates.some((t) => t.id === createdTemplateId)).toBe(true);
    });
  });

  describe('upsertTemplate — update', () => {
    it('updates existing template when templateId found', async () => {
      const manager = makeManager();
      const updated = await manager.upsertTemplate({
        churchId: CHURCH,
        ministryId: MINISTRY_ID,
        templateId: createdTemplateId,
        name: 'Updated Template',
        items: [{ roleId: ROLE_ID, requiredCount: 3 }],
      });
      expect(updated.id).toBe(createdTemplateId);
      expect(updated.name).toBe('Updated Template');
      expect(updated.items[0]?.requiredCount).toBe(3);
    });
  });

  describe('applyTemplate', () => {
    it('creates slot requirements from template on event slots', async () => {
      const manager = makeManager();
      await manager.applyTemplate({
        churchId: CHURCH,
        eventId: EVENT_ID,
        templateId: createdTemplateId as string,
      });

      const timeSlotRepo = new DrizzleTimeSlotRepository(db);
      const slots = await timeSlotRepo.listByEvent(CHURCH, EVENT_ID);
      expect(slots.length).toBeGreaterThanOrEqual(1);
      const slot = slots[0];
      expect(slot?.requirements?.some((r) => r.roleId === ROLE_ID)).toBe(true);
    });
  });

  describe('deleteTemplate', () => {
    it('removes the template', async () => {
      const manager = makeManager();
      await manager.deleteTemplate({
        templateId: createdTemplateId as string,
        churchId: CHURCH,
      });
      const remaining = await manager.listTemplates({
        churchId: CHURCH,
        ministryId: MINISTRY_ID,
      });
      expect(remaining.every((t) => t.id !== createdTemplateId)).toBe(true);
    });
  });
});
