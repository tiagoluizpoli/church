import { beforeEach, describe, expect, it } from 'vitest';
import { seed, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

describe('createEvent (T092)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
  });

  const caller = () => createCaller(SEED.userAlice);

  describe('Happy Path', () => {
    it('creates a draft event and returns id + status + eventType', async () => {
      const result = await caller().adminLeader.createEvent({
        ministryId: SEED.ministryAdult,
        title: 'Christmas Service',
        startDate: '2026-12-25T09:00:00.000Z',
        endDate: '2026-12-25T11:00:00.000Z',
        eventType: 'hourly',
      });
      expect(result.id).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.eventType).toBe('hourly');
    });

    it('defaults eventType to hourly when omitted', async () => {
      const result = await caller().adminLeader.createEvent({
        ministryId: SEED.ministryAdult,
        title: 'Default Type',
        startDate: '2026-12-25T09:00:00.000Z',
        endDate: '2026-12-25T11:00:00.000Z',
      });
      expect(result.eventType).toBe('hourly');
    });
  });

  describe('Invalid Input', () => {
    it('rejects when startDate is equal to endDate', async () => {
      await expect(
        caller().adminLeader.createEvent({
          ministryId: SEED.ministryAdult,
          title: 'Bad',
          startDate: '2026-12-25T09:00:00.000Z',
          endDate: '2026-12-25T09:00:00.000Z',
        }),
      ).rejects.toThrow();
    });

    it('rejects when startDate is after endDate', async () => {
      await expect(
        caller().adminLeader.createEvent({
          ministryId: SEED.ministryAdult,
          title: 'Bad',
          startDate: '2026-12-25T12:00:00.000Z',
          endDate: '2026-12-25T09:00:00.000Z',
        }),
      ).rejects.toThrow();
    });

    it('rejects an empty title (Zod min(1))', async () => {
      await expect(
        caller().adminLeader.createEvent({
          ministryId: SEED.ministryAdult,
          title: '',
          startDate: '2026-12-25T09:00:00.000Z',
          endDate: '2026-12-25T11:00:00.000Z',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Permission Failures', () => {
    it('rejects a non-leader of the target ministry', async () => {
      await expect(
        createCaller(SEED.userBob).adminLeader.createEvent({
          ministryId: SEED.ministryAdult,
          title: 'Nope',
          startDate: '2026-12-25T09:00:00.000Z',
          endDate: '2026-12-25T11:00:00.000Z',
        }),
      ).rejects.toThrow();
    });
  });
});
