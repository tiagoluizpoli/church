import {
  assignment,
  event,
  ministryVolunteer,
  role,
  slotRequirement,
  team,
  timeSlot,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

const FUTURE_EVENT_START = new Date('2099-01-05T09:00:00Z');
const FUTURE_EVENT_END = new Date('2099-01-05T11:00:00Z');
const LATER_EVENT_START = new Date('2099-01-06T09:00:00Z');
const LATER_EVENT_END = new Date('2099-01-06T11:00:00Z');

describe('getMinistrySchedule', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();

    await testDb
      .update(event)
      .set({
        startDate: FUTURE_EVENT_START,
        endDate: FUTURE_EVENT_END,
        status: 'draft',
      })
      .where(eq(event.id, SEED.eventDraft));

    await testDb
      .update(timeSlot)
      .set({
        startTime: FUTURE_EVENT_START,
        endTime: FUTURE_EVENT_END,
      })
      .where(eq(timeSlot.id, SEED.slotDraft));

    await testDb
      .update(event)
      .set({
        startDate: LATER_EVENT_START,
        endDate: LATER_EVENT_END,
        status: 'published',
      })
      .where(eq(event.id, SEED.eventPublished));

    await testDb
      .update(timeSlot)
      .set({
        startTime: LATER_EVENT_START,
        endTime: LATER_EVENT_END,
      })
      .where(eq(timeSlot.id, SEED.slotPublished));

    await testDb.insert(slotRequirement).values({
      id: '88888888-8888-8888-8888-888888888883',
      churchId: SEED.church,
      slotId: SEED.slotPublished,
      roleId: SEED.roleUsher,
      requiredCount: 1,
    });
  });

  it('returns only current and upcoming published events for selected ministry', async () => {
    const teamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await testDb.insert(team).values({
      id: teamId,
      churchId: SEED.church,
      ministryId: SEED.ministryAdult,
      name: 'Welcome Team',
    });

    await testDb
      .update(slotRequirement)
      .set({ teamId })
      .where(eq(slotRequirement.id, '88888888-8888-8888-8888-888888888883'));

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMinistrySchedule({
      ministryId: SEED.ministryAdult,
    });

    expect(result.ministryId).toBe(SEED.ministryAdult);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(
      expect.objectContaining({
        eventId: SEED.eventPublished,
        title: 'Adult Service',
        assignmentCount: 1,
      }),
    );
    expect(result.events[0]?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: SEED.slotPublished,
          roleName: 'Usher',
          teamName: 'Welcome Team',
          volunteerDisplayName: 'Alice T.',
          confirmationState: 'confirmed',
        }),
      ]),
    );
  });

  it('defaults dashboard ministry to next upcoming assignment ministry when volunteer serves multiple ministries', async () => {
    const youthRoleId = '55555555-5555-5555-5555-555555555553';
    const youthEventId = '66666666-6666-6666-6666-666666666663';
    const youthSlotId = '77777777-7777-7777-7777-777777777773';
    const youthRequirementId = '88888888-8888-8888-8888-888888888882';
    const youthAssignmentId = '99999999-9999-9999-9999-999999999994';

    await testDb.insert(ministryVolunteer).values({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccd',
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      ministryId: SEED.ministryYouth,
      systemRole: 'volunteer',
      status: 'active',
    });

    await testDb.insert(role).values({
      id: youthRoleId,
      churchId: SEED.church,
      ministryId: SEED.ministryYouth,
      name: 'Singer',
      isGlobal: false,
    });

    await testDb.insert(event).values({
      id: youthEventId,
      churchId: SEED.church,
      ministryId: SEED.ministryYouth,
      title: 'Youth Night',
      startDate: FUTURE_EVENT_START,
      endDate: FUTURE_EVENT_END,
      status: 'published',
    });

    await testDb.insert(timeSlot).values({
      id: youthSlotId,
      churchId: SEED.church,
      eventId: youthEventId,
      startTime: FUTURE_EVENT_START,
      endTime: FUTURE_EVENT_END,
      label: 'Youth Opening',
    });

    await testDb.insert(slotRequirement).values({
      id: youthRequirementId,
      churchId: SEED.church,
      slotId: youthSlotId,
      roleId: youthRoleId,
      requiredCount: 1,
    });

    await testDb.insert(assignment).values({
      id: youthAssignmentId,
      churchId: SEED.church,
      slotId: youthSlotId,
      volunteerId: SEED.volunteerAlice,
      roleId: youthRoleId,
      status: 'confirmed',
      assignedAt: new Date('2099-01-01T10:00:00Z'),
      assignedBy: SEED.userAlice,
    });

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getVolunteerDashboard();

    expect(result.defaultMinistryId).toBe(SEED.ministryYouth);
    expect(result.ministryOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: SEED.ministryAdult }),
        expect.objectContaining({ id: SEED.ministryYouth }),
      ]),
    );
  });
});
