import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateEvents(
  ministries: (typeof schema.ministry.$inferSelect)[],
  roles: (typeof schema.role.$inferSelect)[],
) {
  logStep('Generating planning cycles, templates, and events...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 5);

  const referenceDate = new Date(SEED_CONFIG.REFERENCE_DATE);
  const churchIds = [...new Set(ministries.map(({ churchId }) => churchId))];
  const cycles = await db
    .insert(schema.planningCycle)
    .values(
      churchIds.map((churchId) => ({
        id: faker.string.uuid(),
        churchId,
        name: 'Demo planning cycle',
        startDate: new Date(referenceDate.getTime() - 45 * 86_400_000),
        endDate: new Date(referenceDate.getTime() + 120 * 86_400_000),
        state: 'locked' as const,
      })),
    )
    .returning();
  const templates = await db
    .insert(schema.eventTemplate)
    .values(
      churchIds.map((churchId) => ({
        id: faker.string.uuid(),
        churchId,
        name: 'Sunday Service',
        weekday: 0,
      })),
    )
    .returning();
  const blocks = await db
    .insert(schema.timeBlock)
    .values(
      templates.map((template) => ({
        id: faker.string.uuid(),
        churchId: template.churchId,
        templateId: template.id,
        label: 'Main Session',
        startTime: '09:00:00',
        endTime: '11:00:00',
        order: 0,
      })),
    )
    .returning();

  await db.insert(schema.ministryServingProfile).values(
    ministries.map((ministry) => {
      const block = blocks.find(
        ({ churchId }) => churchId === ministry.churchId,
      );
      if (!block) throw new Error('Missing seed time block');
      const role = roles.find(({ ministryId }) => ministryId === ministry.id);
      return {
        id: faker.string.uuid(),
        churchId: ministry.churchId,
        ministryId: ministry.id,
        sourceTemplateBlockId: block.id,
        serves: true,
        shiftSplit: { kind: 'equal' as const, count: 1 },
        headcounts: role ? [{ roleId: role.id, count: 1 }] : [],
      };
    }),
  );

  const eventRows: (typeof schema.event.$inferInsert)[] = [];
  const eventMinistries = new Map<string, string>();
  for (const ministry of ministries) {
    const cycle = cycles.find(({ churchId }) => churchId === ministry.churchId);
    const template = templates.find(
      ({ churchId }) => churchId === ministry.churchId,
    );
    if (!cycle || !template) throw new Error('Missing seed planning data');
    const titles = SEED_CONFIG.MINISTRY_ROLES[ministry.name] ?? [
      'Special Event',
    ];

    for (let index = 0; index < SEED_CONFIG.EVENTS_PER_MINISTRY.PAST; index++) {
      const id = faker.string.uuid();
      const startDate = faker.date.recent({ days: 30, refDate: referenceDate });
      eventMinistries.set(id, ministry.id);
      eventRows.push({
        id,
        churchId: ministry.churchId,
        planningCycleId: cycle.id,
        sourceTemplateId: template.id,
        title: `${ministry.name} ${faker.helpers.arrayElement(titles)}`,
        description: faker.lorem.sentence(),
        location: SEED_CONFIG.DEFAULT_LOCATION,
        startDate,
        endDate: new Date(startDate.getTime() + 2 * 3_600_000),
        status: 'past',
      });
    }

    for (
      let index = 0;
      index < SEED_CONFIG.EVENTS_PER_MINISTRY.FUTURE;
      index++
    ) {
      const id = faker.string.uuid();
      const startDate = faker.date.soon({ days: 90, refDate: referenceDate });
      eventMinistries.set(id, ministry.id);
      eventRows.push({
        id,
        churchId: ministry.churchId,
        planningCycleId: cycle.id,
        sourceTemplateId: template.id,
        title: `${ministry.name} ${faker.helpers.arrayElement(titles)}`,
        description: faker.lorem.sentence(),
        location: SEED_CONFIG.DEFAULT_LOCATION,
        startDate,
        endDate: new Date(startDate.getTime() + 2 * 3_600_000),
        status: 'scheduled',
      });
    }
  }

  const events = await db.insert(schema.event).values(eventRows).returning();
  const participations = await db
    .insert(schema.ministryParticipation)
    .values(
      events.map((event) => ({
        id: faker.string.uuid(),
        churchId: event.churchId,
        eventId: event.id,
        ministryId: eventMinistries.get(event.id) as string,
        state: 'published' as const,
      })),
    )
    .returning();

  logSuccess(`Generated ${events.length} events.`);
  return { events, participations, blocks };
}

export async function generateSlotsAndRequirements(
  events: (typeof schema.event.$inferSelect)[],
  participations: (typeof schema.ministryParticipation.$inferSelect)[],
  blocks: (typeof schema.timeBlock.$inferSelect)[],
  roles: (typeof schema.role.$inferSelect)[],
) {
  logStep('Generating slots, shifts, and requirements...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 6);

  const slots = await db
    .insert(schema.timeSlot)
    .values(
      events.map((event) => ({
        id: faker.string.uuid(),
        churchId: event.churchId,
        eventId: event.id,
        sourceTemplateBlockId: blocks.find(
          ({ churchId }) => churchId === event.churchId,
        )?.id,
        label: 'Main Session',
        startTime: event.startDate,
        endTime: event.endDate,
      })),
    )
    .returning();
  const shifts = await db
    .insert(schema.shift)
    .values(
      slots.map((slot) => {
        const participation = participations.find(
          ({ eventId }) => eventId === slot.eventId,
        );
        if (!participation) throw new Error('Missing seed participation');
        return {
          id: faker.string.uuid(),
          churchId: slot.churchId,
          participationId: participation.id,
          timeSlotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        };
      }),
    )
    .returning();
  const requirements = await db
    .insert(schema.slotRequirement)
    .values(
      shifts.flatMap((shift) => {
        const participation = participations.find(
          ({ id }) => id === shift.participationId,
        );
        if (!participation) return [];
        return roles
          .filter(({ ministryId }) => ministryId === participation.ministryId)
          .map((role) => ({
            id: faker.string.uuid(),
            churchId: shift.churchId,
            participationId: participation.id,
            shiftId: shift.id,
            roleId: role.id,
            requiredCount: faker.number.int({ min: 1, max: 2 }),
          }));
      }),
    )
    .returning();

  logSuccess(
    `Generated ${slots.length} slots, ${shifts.length} shifts, and ${requirements.length} requirements.`,
  );
  return { slots, shifts, requirements };
}
