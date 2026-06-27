import { beforeEach, describe, expect, it } from 'vitest';
import { seed, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

// Slot CRUD procedures: createSlot (T094), updateSlot (T095), deleteSlot (T096).
describe('Slot procedures', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
  });

  const caller = () => createCaller(SEED.userAlice);

  describe('createSlot (T094)', () => {
    it('creates a non-overlapping slot on a draft event', async () => {
      const slot = await caller().adminLeader.createSlot({
        eventId: SEED.eventDraft,
        startTime: '2024-06-05T14:00:00.000Z',
        endTime: '2024-06-05T15:00:00.000Z',
        label: 'Afternoon',
      });
      expect(slot.id).toBeDefined();
      expect(slot.label).toBe('Afternoon');
    });

    it('rejects startTime >= endTime', async () => {
      await expect(
        caller().adminLeader.createSlot({
          eventId: SEED.eventDraft,
          startTime: '2024-06-05T15:00:00.000Z',
          endTime: '2024-06-05T14:00:00.000Z',
        }),
      ).rejects.toThrow(/before/i);
    });

    it('rejects a slot overlapping an existing one', async () => {
      // Seed slot-1 spans 09:00–11:00 on the draft event.
      await expect(
        caller().adminLeader.createSlot({
          eventId: SEED.eventDraft,
          startTime: '2024-06-05T10:00:00.000Z',
          endTime: '2024-06-05T12:00:00.000Z',
        }),
      ).rejects.toThrow(/overlap/i);
    });

    it('refuses to add slots to a published event', async () => {
      await expect(
        caller().adminLeader.createSlot({
          eventId: SEED.eventPublished,
          startTime: '2024-06-04T14:00:00.000Z',
          endTime: '2024-06-04T15:00:00.000Z',
        }),
      ).rejects.toThrow(/published/i);
    });

    it('copies requirements from a source slot when requested', async () => {
      const slot = await caller().adminLeader.createSlot({
        eventId: SEED.eventDraft,
        startTime: '2024-06-05T14:00:00.000Z',
        endTime: '2024-06-05T15:00:00.000Z',
        copyRequirementsFromSlotId: SEED.slotDraft,
      });
      // Seed slot-1 has one requirement (Usher x2).
      expect(slot.requirements.length).toBe(1);
      expect(slot.requirements[0]?.roleId).toBe(SEED.roleUsher);
    });
  });

  describe('updateSlot (T095)', () => {
    it('updates the label of an existing slot', async () => {
      const updated = await caller().adminLeader.updateSlot({
        slotId: SEED.slotDraft,
        label: 'Renamed Service',
      });
      expect(updated.label).toBe('Renamed Service');
    });

    it('rejects an unknown slot', async () => {
      await expect(
        caller().adminLeader.updateSlot({
          slotId: '77777777-7777-7777-7777-7777777777ff',
          label: 'X',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('rejects a time change that overlaps another slot (T111)', async () => {
      // Add a second, non-overlapping slot, then try to move it onto slot-1.
      const second = await caller().adminLeader.createSlot({
        eventId: SEED.eventDraft,
        startTime: '2024-06-05T14:00:00.000Z',
        endTime: '2024-06-05T15:00:00.000Z',
      });
      await expect(
        caller().adminLeader.updateSlot({
          slotId: second.id,
          startTime: '2024-06-05T10:00:00.000Z',
          endTime: '2024-06-05T10:30:00.000Z',
        }),
      ).rejects.toThrow(/overlap/i);
    });

    it('allows a time change that overlaps only itself (T111)', async () => {
      // Re-saving slot-1 with its own window must not self-conflict.
      const updated = await caller().adminLeader.updateSlot({
        slotId: SEED.slotDraft,
        startTime: '2024-06-05T09:00:00.000Z',
        endTime: '2024-06-05T10:30:00.000Z',
      });
      expect(updated.id).toBe(SEED.slotDraft);
    });
  });

  describe('deleteSlot (T096)', () => {
    it('returns assignmentCount without deleting when the slot has assignments and force is not set', async () => {
      // Seed slot-1 has active assignments.
      const result = await caller().adminLeader.deleteSlot({
        slotId: SEED.slotDraft,
      });
      expect(result.success).toBe(false);
      expect(result.assignmentCount).toBeGreaterThan(0);
    });

    it('deletes the slot when force is true', async () => {
      const result = await caller().adminLeader.deleteSlot({
        slotId: SEED.slotDraft,
        force: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown slot', async () => {
      await expect(
        caller().adminLeader.deleteSlot({
          slotId: '77777777-7777-7777-7777-7777777777ff',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
