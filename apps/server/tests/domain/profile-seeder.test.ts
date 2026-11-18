import { fromTimeColumn, parseInstant, parseTimeOfDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  EventTimeBlockId,
  RoleId,
  SectorId,
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
const sectorId = '99999999-9999-4999-8999-999999999999' as SectorId;

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
  it('DL1-PS-01 profile entry with serves=true seeds inclusion, split shifts, and each Shift its own requirements', () => {
    const entry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [
        { shiftIndex: 0, sectorId, roleId, peopleNeeded: 3 },
        { shiftIndex: 1, sectorId, roleId, peopleNeeded: 1 },
      ],
    };

    const result = plan({ profileEntries: [entry] });

    expect(result.include).toBe(true);
    expect(result.shifts).toHaveLength(2);
    expect(result.shifts[0]?.startTime).toEqual(
      templatedEventTimeBlock.startTime,
    );
    expect(result.shifts[1]?.endTime).toEqual(templatedEventTimeBlock.endTime);
    expect(result.shifts[0]?.headcounts).toEqual([
      { shiftIndex: 0, sectorId, roleId, peopleNeeded: 3 },
    ]);
    expect(result.shifts[1]?.headcounts).toEqual([
      { shiftIndex: 1, sectorId, roleId, peopleNeeded: 1 },
    ]);
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
      headcounts: [{ shiftIndex: 1, sectorId, roleId, peopleNeeded: 2 }],
    };

    const result = plan({ profileEntries: [entry] });

    expect(result.shifts).toHaveLength(2);
    expect(result.shifts[0]?.headcounts).toEqual([]);
    expect(result.shifts[1]?.headcounts).toEqual([
      { shiftIndex: 1, sectorId, roleId, peopleNeeded: 2 },
    ]);
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

  it('resolves overnight manual spans past midnight in the Church Timezone', () => {
    // 22:00–02:00 church time (UTC-3) → 01:00–05:00 UTC the next day.
    const overnight = {
      ...templatedEventTimeBlock,
      startTime: parseInstant({ value: '2026-08-03T01:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-03T05:00:00.000Z' }),
    };
    const entry: ProfileSeederEntry = {
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            startTime: parseTimeOfDay({ value: '23:00' }),
            endTime: parseTimeOfDay({ value: '00:00' }),
          },
          {
            startTime: parseTimeOfDay({ value: '00:00' }),
            endTime: parseTimeOfDay({ value: '01:30' }),
          },
        ],
      },
      headcounts: [],
    };

    const result = plan({ eventTimeBlock: overnight, profileEntries: [entry] });

    expect(
      result.shifts.map((shift) => [shift.startTime, shift.endTime]),
    ).toEqual([
      [
        parseInstant({ value: '2026-08-03T02:00:00.000Z' }),
        parseInstant({ value: '2026-08-03T03:00:00.000Z' }),
      ],
      [
        parseInstant({ value: '2026-08-03T03:00:00.000Z' }),
        parseInstant({ value: '2026-08-03T04:30:00.000Z' }),
      ],
    ]);
  });

  it('gives the equal split remainder to the final Shift', () => {
    // 180 minutes in 7 Shifts leaves a remainder for the final Shift.
    const result = plan({
      profileEntries: [
        {
          sourceTemplateTimeBlockId: blockId,
          serves: true,
          shiftSplit: { kind: 'equal', count: 7 },
          headcounts: [],
        },
      ],
    });

    expect(result.shifts).toHaveLength(7);
    expect(result.shifts[0]?.startTime).toEqual(
      templatedEventTimeBlock.startTime,
    );
    expect(result.shifts[6]?.endTime).toEqual(templatedEventTimeBlock.endTime);
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
