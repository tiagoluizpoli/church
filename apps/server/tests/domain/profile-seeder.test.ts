import { fromTimeColumn, parseInstant, parseTimeOfDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  EventTimeBlockId,
  RoleId,
  TemplateTimeBlockId,
} from '@/domain/branded-ids';
import {
  ProfileSeeder,
  type ProfileSeederEntry,
  type SeedParticipationPlanInput,
} from '@/domain/services/profile-seeder';

const timeZone = 'America/Sao_Paulo';
const blockId = '88888888-8888-4888-8888-888888888888' as TemplateTimeBlockId;
const otherBlockId =
  '88888888-8888-4888-8888-888888888889' as TemplateTimeBlockId;
const roleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as RoleId;

// 09:00–12:00 church time (UTC-3) → 12:00–15:00 UTC
const templatedEventTimeBlock = {
  eventTimeBlockId: '66666666-6666-4666-8666-666666666666' as EventTimeBlockId,
  sourceTemplateTimeBlockId: blockId,
  startTime: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
  endTime: parseInstant({ value: '2026-08-02T15:00:00.000Z' }),
};

const dynamicEventTimeBlock = {
  eventTimeBlockId: '66666666-6666-4666-8666-666666666667' as EventTimeBlockId,
  startTime: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
  endTime: parseInstant({ value: '2026-08-02T15:00:00.000Z' }),
};

const seeder = new ProfileSeeder();

function plan(input: Partial<SeedParticipationPlanInput>) {
  return seeder.plan({
    eventTimeBlock: templatedEventTimeBlock,
    profileEntries: [],
    globalDefaultAllIn: false,
    timeZone,
    ...input,
  });
}

describe('ProfileSeeder three-tier seeding (DL1-PS)', () => {
  it('DL1-PS-01 profile entry with serves=true seeds inclusion, split shifts, and requirements', () => {
    const entry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [{ roleId, peopleNeeded: 3 }],
    };

    const result = plan({ profileEntries: [entry] });

    expect(result.include).toBe(true);
    expect(result.shifts).toHaveLength(2);
    expect(result.shifts[0]?.startTime).toEqual(
      templatedEventTimeBlock.startTime,
    );
    expect(result.shifts[1]?.endTime).toEqual(templatedEventTimeBlock.endTime);
    expect(result.shifts[0]?.headcounts).toEqual([{ roleId, peopleNeeded: 3 }]);
    expect(result.shifts[1]?.headcounts).toEqual([{ roleId, peopleNeeded: 3 }]);
  });

  it('maps manual profile spans onto the event time block date in church timezone', () => {
    const entry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            label: 'Setup',
            startTime: parseTimeOfDay({ value: '09:00' }),
            endTime: parseTimeOfDay({ value: '10:30' }),
          },
          {
            label: 'Serve',
            startTime: parseTimeOfDay({ value: '10:30' }),
            endTime: parseTimeOfDay({ value: '12:00' }),
          },
        ],
      },
      headcounts: [],
    };

    const result = plan({ profileEntries: [entry] });

    expect(result.shifts).toHaveLength(2);
    expect(result.shifts[0]?.startTime).toEqual(
      parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
    );
    expect(result.shifts[0]?.endTime).toEqual(
      parseInstant({ value: '2026-08-02T13:30:00.000Z' }),
    );
    expect(result.shifts[0]?.label).toBe('Setup');
    expect(result.shifts[1]?.endTime).toEqual(
      parseInstant({ value: '2026-08-02T15:00:00.000Z' }),
    );
  });

  it('accepts manual span times that already include seconds', () => {
    const entry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            label: 'Serve',
            startTime: fromTimeColumn({ value: '09:00:00' }),
            endTime: fromTimeColumn({ value: '12:00:00' }),
          },
        ],
      },
      headcounts: [],
    };

    const result = plan({ profileEntries: [entry] });

    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0]?.startTime).toEqual(
      parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
    );
    expect(result.shifts[0]?.endTime).toEqual(
      parseInstant({ value: '2026-08-02T15:00:00.000Z' }),
    );
  });

  it('DL1-PS-02 no profile falls to ministry defaultDirection', () => {
    const allIn = plan({ ministryDefaultDirection: 'all_in' });
    expect(allIn.include).toBe(true);
    expect(allIn.shifts).toHaveLength(1);
    expect(allIn.shifts[0]?.startTime).toEqual(
      templatedEventTimeBlock.startTime,
    );
    expect(allIn.shifts[0]?.endTime).toEqual(templatedEventTimeBlock.endTime);
    expect(allIn.shifts[0]?.headcounts).toEqual([]);

    const allOut = plan({ ministryDefaultDirection: 'all_out' });
    expect(allOut.include).toBe(false);
    expect(allOut.shifts).toHaveLength(0);
  });

  it('DL1-PS-03 without ministry setting the global flag decides (both states)', () => {
    const flagOn = plan({ globalDefaultAllIn: true });
    expect(flagOn.include).toBe(true);
    expect(flagOn.shifts).toHaveLength(1);

    const flagOff = plan({ globalDefaultAllIn: false });
    expect(flagOff.include).toBe(false);
  });

  it('DL1-PS-04 narrower tier wins: entry over ministry, ministry over global', () => {
    const optedOutEntry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: false,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    };

    const entryOverMinistry = plan({
      profileEntries: [optedOutEntry],
      ministryDefaultDirection: 'all_in',
      globalDefaultAllIn: true,
    });
    expect(entryOverMinistry.include).toBe(false);

    const ministryOverGlobal = plan({
      ministryDefaultDirection: 'all_out',
      globalDefaultAllIn: true,
    });
    expect(ministryOverGlobal.include).toBe(false);

    const optedInEntry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    };
    const entryOverAllOut = plan({
      profileEntries: [optedInEntry],
      ministryDefaultDirection: 'all_out',
      globalDefaultAllIn: false,
    });
    expect(entryOverAllOut.include).toBe(true);
  });

  it('ignores profile entries for other template blocks', () => {
    const unrelatedEntry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: otherBlockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [],
    };

    const result = plan({
      profileEntries: [unrelatedEntry],
      ministryDefaultDirection: 'all_out',
    });

    expect(result.include).toBe(false);
  });

  it('DL1-PS-05 dynamic event time blocks (no template block) are never auto-seeded', () => {
    const result = plan({
      eventTimeBlock: dynamicEventTimeBlock,
      ministryDefaultDirection: 'all_in',
      globalDefaultAllIn: true,
    });

    expect(result.include).toBe(false);
    expect(result.shifts).toHaveLength(0);
  });
});
